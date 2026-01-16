import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { t } from './i18n';
import MyPlugin from './main';
import { print } from './main';
import * as fs from 'fs';
import * as path from 'path';

export class ModifyPropertiesModal extends Modal {
    plugin: MyPlugin;
    id: string;
    name: string;
    annotation: string;
    url: string;
    tags: string[];
    allTags: string[] = [];
    selectedTags: Set<string>;
    onSubmit: (id: string, name: string, annotation: string, url: string, tags: string[]) => void;
    
    // UI Elements
    tagsContainer: HTMLElement;
    searchQuery: string = '';

    constructor(
        app: App, 
        plugin: MyPlugin,
        id: string, 
        name: string, 
        annotation: string, 
        url: string, 
        tags: string[], 
        onSubmit: (id: string, name: string, annotation: string, url: string, tags: string[]) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.id = id;
        this.name = name;
        this.annotation = annotation;
        this.url = url;
        this.tags = this.normalizeTagList(tags);
        this.selectedTags = new Set(this.tags);
        this.onSubmit = onSubmit;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('modal.modifyProperties.title') });

        // Name
        new Setting(contentEl)
            .setName(t('modal.modifyProperties.name'))
            .addText(text => text
                .setValue(this.name)
                .onChange(value => {
                    this.name = value;
                })
                .inputEl.style.width = '100%'
            );

        // Annotation
        new Setting(contentEl)
            .setName(t('modal.modifyProperties.annotation'))
            .addText(text => text
                .setValue(this.annotation)
                .onChange(value => {
                    this.annotation = value;
                })
                .inputEl.style.width = '100%'
            );

        // URL
        new Setting(contentEl)
            .setName(t('modal.modifyProperties.url'))
            .addText(text => text
                .setValue(this.url)
                .onChange(value => {
                    this.url = value;
                })
                .inputEl.style.width = '100%'
            );

        // Tags Section
        contentEl.createEl('h3', { text: t('modal.modifyProperties.tags') });
        
        // Selected Tags Area
        const selectedTagsContainer = contentEl.createDiv({ cls: 'eagle-selected-tags' });
        selectedTagsContainer.style.display = 'flex';
        selectedTagsContainer.style.flexWrap = 'wrap';
        selectedTagsContainer.style.gap = '5px';
        selectedTagsContainer.style.marginBottom = '10px';
        
        this.renderSelectedTags(selectedTagsContainer);

        // Tag Search/Add
        const searchContainer = contentEl.createDiv({ cls: 'eagle-tag-search' });
        searchContainer.style.display = 'flex';
        searchContainer.style.gap = '10px';
        searchContainer.style.marginBottom = '10px';

        const searchInput = searchContainer.createEl('input', { 
            type: 'text', 
            placeholder: t('modal.modifyProperties.searchTags') 
        });
        searchInput.style.flex = '1';
        searchInput.oninput = (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.renderAvailableTags(availableTagsContainer);
        };

        const addButton = searchContainer.createEl('button', { text: t('modal.modifyProperties.addTag') });
        addButton.onclick = () => {
            const newTag = searchInput.value.trim();
            if (newTag && !this.selectedTags.has(newTag)) {
                this.selectedTags.add(newTag);
                searchInput.value = '';
                this.searchQuery = '';
                this.renderSelectedTags(selectedTagsContainer);
                this.renderAvailableTags(availableTagsContainer);
            }
        };

        // Available Tags Area
        const availableTagsContainer = contentEl.createDiv({ cls: 'eagle-available-tags' });
        availableTagsContainer.style.display = 'flex';
        availableTagsContainer.style.flexWrap = 'wrap';
        availableTagsContainer.style.gap = '5px';
        availableTagsContainer.style.maxHeight = '150px';
        availableTagsContainer.style.overflowY = 'auto';
        availableTagsContainer.style.border = '1px solid var(--background-modifier-border)';
        availableTagsContainer.style.padding = '10px';

        // Load tags
        await this.fetchTags();
        this.renderAvailableTags(availableTagsContainer);

        // Save Button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('modal.modifyProperties.save'))
                .setCta()
                .onClick(async () => {
                    await this.save();
                }));
    }

    renderSelectedTags(container: HTMLElement) {
        container.empty();
        this.selectedTags.forEach(tag => {
            const tagEl = container.createDiv({ cls: 'eagle-tag-chip' });
            tagEl.style.backgroundColor = 'var(--interactive-accent)';
            tagEl.style.color = 'var(--text-on-accent)';
            tagEl.style.padding = '2px 8px';
            tagEl.style.borderRadius = '12px';
            tagEl.style.fontSize = '12px';
            tagEl.style.cursor = 'pointer';
            tagEl.style.display = 'flex';
            tagEl.style.alignItems = 'center';
            tagEl.style.gap = '5px';

            tagEl.createSpan({ text: tag });
            const closeIcon = tagEl.createSpan({ cls: 'eagle-tag-close' });
            setIcon(closeIcon, 'x');
            closeIcon.style.width = '12px';
            closeIcon.style.height = '12px';
            
            tagEl.onclick = () => {
                this.selectedTags.delete(tag);
                this.renderSelectedTags(container);
            };
        });
    }

    renderAvailableTags(container: HTMLElement) {
        container.empty();
        const query = this.searchQuery.toLowerCase();
        const filteredTags = this.allTags.filter(tag => 
            tag.toLowerCase().includes(query) && !this.selectedTags.has(tag)
        );

        filteredTags.forEach(tag => {
            const tagEl = container.createDiv({ cls: 'eagle-tag-item' });
            tagEl.style.backgroundColor = 'var(--background-secondary)';
            tagEl.style.padding = '2px 8px';
            tagEl.style.borderRadius = '12px';
            tagEl.style.fontSize = '12px';
            tagEl.style.cursor = 'pointer';
            tagEl.style.border = '1px solid var(--background-modifier-border)';

            tagEl.createSpan({ text: tag });

            tagEl.onclick = () => {
                this.selectedTags.add(tag);
                // Re-render both
                const selectedContainer = this.contentEl.querySelector('.eagle-selected-tags') as HTMLElement;
                if (selectedContainer) this.renderSelectedTags(selectedContainer);
                this.renderAvailableTags(container);
            };
        });
    }

    async fetchTags() {
        try {
            // Proxy through plugin server to avoid CORS
            const port = this.plugin.settings.port || 6060;
            const response = await fetch(`http://localhost:${port}/api/tag/list`);
            const result = await response.json();
            if (result.status === 'success') {
                const raw = result.data || [];
                this.allTags = this.normalizeTagList(raw);
            }
        } catch (error) {
            console.error('Failed to fetch tags', error);
            new Notice('Failed to fetch tags from Eagle');
        }
    }

    async save() {
        try {
            const libraryPath = this.plugin.settings.libraryPath;
            if (!libraryPath) {
                new Notice(t('modal.modifyProperties.uploadFailed'));
                print('ModifyPropertiesModal.save no libraryPath');
                return;
            }

            const dirPath = path.join(libraryPath, 'images', `${this.id}.info`);
            const metaPath = path.join(dirPath, 'metadata.json');

            print('ModifyPropertiesModal.save start', {
                id: this.id,
                name: this.name,
                dirPath,
                metaPath,
            });

            const raw = await fs.promises.readFile(metaPath, 'utf8');
            const data = JSON.parse(raw);

            const oldName: string = data.name || this.name;
            const ext: string = data.ext;
            const tags = Array.from(this.selectedTags);

            data.name = this.name;
            data.annotation = this.annotation;
            data.url = this.url;
            data.tags = tags;

            await fs.promises.writeFile(metaPath, JSON.stringify(data, null, 2), 'utf8');

            print('ModifyPropertiesModal.save metadata written', {
                id: this.id,
                oldName,
                newName: this.name,
                ext,
                tagsCount: tags.length,
            });

            if (ext && this.name && oldName && oldName !== this.name) {
                const oldFilePath = path.join(dirPath, `${oldName}.${ext}`);
                const newFilePath = path.join(dirPath, `${this.name}.${ext}`);
                const exists = fs.existsSync(oldFilePath);
                print('ModifyPropertiesModal.save rename check', {
                    oldFilePath,
                    newFilePath,
                    exists,
                });
                if (exists) {
                    await fs.promises.rename(oldFilePath, newFilePath);
                    print('ModifyPropertiesModal.save rename success');
                } else {
                    print('ModifyPropertiesModal.save rename skipped, old file not found');
                }
            }

            new Notice(t('modal.modifyProperties.uploadSuccess'));
            this.onSubmit(this.id, this.name, this.annotation, this.url, tags);
            this.close();
        } catch (error) {
            print('ModifyPropertiesModal.save error', error);
            new Notice(t('modal.modifyProperties.uploadFailed'));
        }
    }

    private normalizeTagList(input: any[]): string[] {
        if (!Array.isArray(input)) return [];
        const result: string[] = [];
        for (const item of input) {
            if (typeof item === 'string') {
                result.push(item);
            } else if (item && typeof (item as any).name === 'string') {
                result.push((item as any).name);
            } else if (item && typeof (item as any).title === 'string') {
                result.push((item as any).title);
            }
        }
        return result;
    }

    onClose() {
        this.contentEl.empty();
    }
}
