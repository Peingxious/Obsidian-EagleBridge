import { App, Modal, Notice, Setting } from 'obsidian';
import { t } from './i18n';
import MyPlugin from './main';
import * as fs from 'fs';
import * as path from 'path';

interface EagleFolder {
    id: string;
    name: string;
    children: EagleFolder[];
    parent?: string;
}

export class FolderSelectModal extends Modal {
    private plugin: MyPlugin;
    private itemIds: string[];
    private folders: EagleFolder[] = [];
    private selectedFolderIds: Set<string> = new Set();
    private searchQuery: string = '';
    private folderListEl: HTMLElement;
    private rootTabs: EagleFolder[] = [];
    private activeRootId: string | null = null;
    private tabsContainer: HTMLElement | null = null;

    constructor(app: App, plugin: MyPlugin, itemIds: string[], initialFolderIds: string[] = []) {
        super(app);
        this.plugin = plugin;
        this.itemIds = itemIds;
        initialFolderIds.forEach(id => this.selectedFolderIds.add(id));
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: t('modal.folderSelect.title') });

        // Search
        new Setting(contentEl)
            .setName(t('modal.folderSelect.search'))
            .addText(text => text
                .setPlaceholder(t('modal.folderSelect.searchPlaceholder'))
                .onChange(value => {
                    this.searchQuery = value.toLowerCase();
                    this.renderFolderList();
                }));

        // New Folder
        new Setting(contentEl)
            .setName(t('modal.folderSelect.newFolder'))
            .setDesc(t('modal.folderSelect.newFolderDesc'))
            .addText(text => text
                .setPlaceholder(t('modal.folderSelect.newFolderPlaceholder'))
                .onChange(value => {
                   text.inputEl.dataset.value = value;
                }))
            .addButton(btn => btn
                .setButtonText(t('modal.folderSelect.create'))
                .onClick(async () => {
                    const input = btn.buttonEl.parentElement?.parentElement?.querySelector('input');
                    const name = input?.value;
                    if (name) {
                        await this.createFolder(name);
                        if (input) input.value = '';
                        await this.fetchFolders();
                        this.buildRootTabs();
                        this.renderTabs();
                        this.renderFolderList();
                    }
                }));

        const tabsRow = contentEl.createDiv();
        tabsRow.style.display = 'flex';
        tabsRow.style.flexWrap = 'wrap';
        tabsRow.style.gap = '6px';
        tabsRow.style.marginTop = '8px';
        this.tabsContainer = tabsRow;

        this.folderListEl = contentEl.createDiv({ cls: 'eagle-folder-list' });
        this.folderListEl.style.maxHeight = '300px';
        this.folderListEl.style.overflowY = 'auto';
        this.folderListEl.style.border = '1px solid var(--background-modifier-border)';
        this.folderListEl.style.padding = '10px';
        this.folderListEl.style.marginTop = '10px';

        // Buttons
        const buttonSetting = new Setting(contentEl);
        buttonSetting.addButton(btn => btn
            .setButtonText(t('modal.folderSelect.cancel'))
            .onClick(() => this.close()));
        buttonSetting.addButton(btn => btn
            .setButtonText(t('modal.folderSelect.save'))
            .setCta()
            .onClick(() => this.save()));

        await this.fetchFolders();
        this.buildRootTabs();
        this.renderTabs();
        this.renderFolderList();
    }

    async fetchFolders() {
        try {
            const response = await fetch(`http://localhost:${this.plugin.settings.port || 6060}/api/folder/list?t=${Date.now()}`);
            if (!response.ok) {
                new Notice('Failed to fetch folders from Eagle');
                return;
            }
            const result = await response.json();
            if (result.status === 'success' && Array.isArray(result.data)) {
                this.folders = result.data;
            } else {
                new Notice('Failed to fetch folders from Eagle');
            }
        } catch (error) {
            new Notice('Error connecting to Eagle');
            console.error(error);
        }
    }

    async createFolder(name: string) {
        try {
            const parent = this.activeRootId || undefined;
            const response = await fetch(`http://localhost:${this.plugin.settings.port || 6060}/api/folder/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName: name, parent: parent || undefined })
            });
            if (!response.ok) {
                new Notice(t('modal.folderSelect.createFailed'));
                return;
            }
            const result = await response.json();
            if (result.status === 'success') {
                new Notice(t('modal.folderSelect.createSuccess'));
            } else {
                new Notice(t('modal.folderSelect.createFailed'));
            }
        } catch (error) {
             new Notice(t('modal.folderSelect.createFailed'));
        }
    }

    private findFolderById(id: string, nodes: EagleFolder[]): EagleFolder | null {
        const stack: EagleFolder[] = [...nodes];
        while (stack.length > 0) {
            const node = stack.pop() as EagleFolder;
            if (node.id === id) return node;
            if (node.children && node.children.length > 0) {
                for (const child of node.children) {
                    stack.push(child);
                }
            }
        }
        return null;
    }

    private buildRootTabs() {
        this.rootTabs = [];
        if (!this.folders || this.folders.length === 0) {
            this.activeRootId = null;
            return;
        }

        const scopeId = this.plugin.settings.folderScope;
        const rootsConfig = this.plugin.settings.projectFolderRoots || [];

        const tabs: EagleFolder[] = [];

        if (rootsConfig.length > 0) {
            for (const cfg of rootsConfig) {
                if (!cfg.folderId) continue;
                const node = this.findFolderById(cfg.folderId, this.folders);
                if (node) {
                    tabs.push(node);
                }
            }
        } else {
            let baseRoots: EagleFolder[] = this.folders;
            if (scopeId) {
                const scopedRoot = this.findFolderById(scopeId, this.folders);
                if (scopedRoot && scopedRoot.children && scopedRoot.children.length > 0) {
                    baseRoots = [scopedRoot];
                }
            }
            for (const root of baseRoots) {
                if (root.children && root.children.length > 0) {
                    for (const child of root.children) {
                        tabs.push(child);
                    }
                }
            }
        }

        this.rootTabs = tabs;

        if (this.activeRootId && !this.rootTabs.find(f => f.id === this.activeRootId)) {
            this.activeRootId = null;
        }

        if (!this.activeRootId && this.rootTabs.length > 0) {
            this.activeRootId = this.rootTabs[0].id;
        }
    }

    private renderTabs() {
        if (!this.tabsContainer) return;
        this.tabsContainer.empty();

        const createChip = (text: string, rootId: string | null) => {
            const chip = this.tabsContainer!.createDiv();
            chip.textContent = text;
            chip.style.padding = '2px 8px';
            chip.style.borderRadius = '999px';
            chip.style.cursor = 'pointer';
            chip.style.fontSize = '12px';
            chip.style.border = '1px solid var(--background-modifier-border)';

            const isActive = rootId === null
                ? this.activeRootId === null
                : this.activeRootId === rootId;

            if (isActive) {
                chip.style.backgroundColor = 'var(--interactive-accent)';
                chip.style.color = 'var(--text-on-accent)';
            }

            chip.onclick = () => {
                this.activeRootId = rootId;
                this.renderTabs();
                this.renderFolderList();
            };
        };

        createChip(t('modal.insertImage.filterAll'), null);

        for (const tab of this.rootTabs) {
            createChip(tab.name, tab.id);
        }
    }

    renderFolderList() {
        this.folderListEl.empty();
        let roots = this.folders;
        
        const rootsConfig = this.plugin.settings.projectFolderRoots || [];

        if (rootsConfig.length > 0) {
            if (this.activeRootId) {
                const activeRoot = this.findFolderById(this.activeRootId, this.folders);
                if (activeRoot && activeRoot.children && activeRoot.children.length > 0) {
                    roots = activeRoot.children;
                } else {
                    roots = [];
                }
            } else {
                const list: EagleFolder[] = [];
                for (const cfg of rootsConfig) {
                    if (!cfg.folderId) continue;
                    const node = this.findFolderById(cfg.folderId, this.folders);
                    if (node) {
                        list.push(node);
                    }
                }
                roots = list;
            }
        }

        const renderTree = (nodes: EagleFolder[], depth: number, container: HTMLElement) => {
             for (const node of nodes) {
                 const hasChildren = node.children && node.children.length > 0;
                 const matchesSearch = !this.searchQuery || node.name.toLowerCase().includes(this.searchQuery);
                 
                 // Logic: 
                 // If no search: show tree.
                 // If search: show matches. If parent matches, show it. If child matches, show it.
                 // This is a bit complex for a simple modal.
                 // Let's implement a simpler version: If search is active, show flat list of matches.
                 // If no search, show tree.
                 
                 if (this.searchQuery) {
                     // Recursive search collection
                     const collectMatches = (n: EagleFolder, list: EagleFolder[]) => {
                         if (n.name.toLowerCase().includes(this.searchQuery)) {
                             list.push(n);
                         }
                         if (n.children) {
                             n.children.forEach(c => collectMatches(c, list));
                         }
                     };
                     // Only do this at the top level call
                     if (depth === 0) {
                        const matches: EagleFolder[] = [];
                        nodes.forEach(n => collectMatches(n, matches));
                        
                        // Deduplicate if needed (though tree structure shouldn't have dups)
                        matches.forEach(m => {
                             const div = container.createDiv({ cls: 'eagle-folder-item' });
                             div.style.paddingLeft = '5px';
                             div.style.display = 'flex';
                             div.style.alignItems = 'center';
                             
                             const cb = div.createEl('input', { type: 'checkbox' });
                             cb.checked = this.selectedFolderIds.has(m.id);
                             cb.onchange = () => {
                                 if (cb.checked) this.selectedFolderIds.add(m.id);
                                 else this.selectedFolderIds.delete(m.id);
                             };
                             
                             div.createSpan({ text: m.name, cls: 'eagle-folder-name' }).style.marginLeft = "8px";
                        });
                        return; // Stop standard recursion
                     }
                 } else {
                     // Standard tree render
                     const div = container.createDiv({ cls: 'eagle-folder-item' });
                     div.style.paddingLeft = `${depth * 20}px`;
                     div.style.display = 'flex';
                     div.style.alignItems = 'center';

                     const cb = div.createEl('input', { type: 'checkbox' });
                     cb.checked = this.selectedFolderIds.has(node.id);
                     cb.onchange = () => {
                         if (cb.checked) this.selectedFolderIds.add(node.id);
                         else this.selectedFolderIds.delete(node.id);
                     };

                     div.createSpan({ text: node.name, cls: 'eagle-folder-name' }).style.marginLeft = "8px";

                     if (hasChildren) {
                         renderTree(node.children, depth + 1, container);
                     }
                 }
             }
        };
        
        renderTree(roots, 0, this.folderListEl);
    }

    async save() {
        try {
            let folders = Array.from(this.selectedFolderIds);
            if (folders.length === 0 && this.activeRootId) {
                folders = [this.activeRootId];
            }
            const libraryPath = this.plugin.settings.libraryPath;

            for (const id of this.itemIds) {
                const dirPath = path.join(libraryPath, 'images', `${id}.info`);
                const metaPath = path.join(dirPath, 'metadata.json');

                const raw = await fs.promises.readFile(metaPath, 'utf8');
                const data = JSON.parse(raw);
                data.folders = folders;
                await fs.promises.writeFile(metaPath, JSON.stringify(data, null, 2), 'utf8');
            }
            new Notice(t('modal.folderSelect.saveSuccess'));
            this.close();
        } catch (error) {
            new Notice(t('modal.folderSelect.saveFailed'));
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
