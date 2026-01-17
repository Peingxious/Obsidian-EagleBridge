import { App, Modal, Notice, Setting, MarkdownView } from 'obsidian';
import { MyPluginSettings } from './setting';
import MyPlugin, { print, setDebug } from './main';
import { t } from './i18n';

export class EagleJumpModal extends Modal {
	private onSubmit: (link: string) => void;
	private settings: MyPluginSettings;

	constructor(app: App, settings: MyPluginSettings, onSubmit: (link: string) => void) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: t('modal.eagleJump.title') });

		let linkInput: HTMLInputElement;

		new Setting(contentEl)
			.addText(text => {
				linkInput = text.inputEl;
				text.setPlaceholder(t('modal.eagleJump.placeholder'));
				linkInput.style.width = '400px'; // 设置文本框宽度为400
			});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		// buttonContainer.style.gap = '10px'; // 设置按钮之间的间距
		buttonContainer.style.alignItems = 'end'; // 确保按钮在同一行上
		buttonContainer.style.justifyContent = 'center'; // 确保按钮在同一行上

		new Setting(buttonContainer)
			.addButton(btn => btn
				.setButtonText(t('modal.eagleJump.jump'))
				.setCta()
				.onClick(() => {
					const link = linkInput.value.trim();
					if (link) {
						// 检查链接格式
						const eaglePattern = /^eagle:\/\/item\/([A-Z0-9]+)$/;
						const uuidPattern = /^.+$/; // 匹配任意非空字符串
						const imagePattern = /http:\/\/localhost:\d+\/images\/([A-Z0-9]+)\.info/;

						const eagleMatch = link.match(eaglePattern);
						const uuidMatch = link.match(uuidPattern);
						const imageMatch = link.match(imagePattern);

						if (eagleMatch || imageMatch) {
							// 如果是 eagle://item/ 或者图片链接格式，使用 Obsidian 的搜索功能
							const itemId = eagleMatch ? eagleMatch[1] : (imageMatch ? imageMatch[1] : null);
							if (itemId) {
								print(`Search ID in Obsidian: ${itemId}`);
								// 打开搜索面板
								let searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
								if (!searchLeaf) {
									searchLeaf = this.app.workspace.getLeaf(true); // 获取一个新的叶子
									searchLeaf.setViewState({ type: 'search' }); // 设置视图类型为搜索
								}
								this.app.workspace.revealLeaf(searchLeaf);
								const searchView = searchLeaf.view;
								if (searchView && typeof (searchView as any).setQuery === 'function') {
									(searchView as any).setQuery(itemId);
								} else {
									new Notice(t('modal.eagleJump.searchNotSupported'));
								}
							} else {
								new Notice(t('modal.eagleJump.cannotExtractId'));
							}
						} else if (uuidMatch) {
							// 如果是 UUID 格式，构建 obsidian://adv-uri 链接
							const obsidianStoreId = this.settings.obsidianStoreId;
							const advUri = `obsidian://adv-uri?vault=${obsidianStoreId}&uid=${link}`;
							print(`Run link: ${advUri}`);
							window.open(advUri, '_blank');
						} else {
							new Notice(t('modal.eagleJump.invalidLink'));
						}
						this.close();
					} else {
						new Notice(t('modal.eagleJump.invalidLink'));
					}
				}));

		new Setting(buttonContainer)
			.addButton(btn => btn
				.setButtonText(t('modal.eagleJump.cancel'))
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 使用示例
export function jumpModal(app: App, settings: MyPluginSettings) {
	new EagleJumpModal(app, settings, (link) => {
		print(`User input link: ${link}`);
	}).open();
}

export class InsertImageFromEagleModal extends Modal {
	private plugin: MyPlugin;
	private settings: MyPluginSettings;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private infoEl: HTMLElement;
	private searchTimer: number | null = null;
	private selectedIndex: number = -1;
	private currentItems: any[] = [];
	private resultElements: HTMLElement[] = [];
	private currentPort: number = 6060;
	private selectedFolderFilterIds: Set<string> = new Set();

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: t('modal.insertImage.title') });

		const searchRow = contentEl.createDiv();
		searchRow.style.display = 'flex';
		searchRow.style.gap = '8px';
		searchRow.style.marginBottom = '8px';

		this.searchInput = searchRow.createEl('input', {
			type: 'text',
			placeholder: t('modal.insertImage.placeholder'),
		});
		this.searchInput.style.flex = '1';
		this.searchInput.addEventListener('input', () => {
			this.scheduleSearch();
		});
		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				this.moveSelection(1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				this.moveSelection(-1);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (this.selectedIndex !== -1 && this.currentItems[this.selectedIndex]) {
					this.insertImage(this.currentItems[this.selectedIndex], this.currentPort);
				} else {
					this.search();
				}
			}
		});

		const filters = this.settings.folderFilters || [];
		if (filters.length > 0) {
			const savedIds = this.settings.selectedFolderFilterIds || [];
			this.selectedFolderFilterIds = new Set(savedIds);

			const filterRow = contentEl.createDiv();
			filterRow.style.display = 'flex';
			filterRow.style.alignItems = 'center';
			filterRow.style.flexWrap = 'wrap';
			filterRow.style.gap = '8px';
			filterRow.style.marginBottom = '6px';

			const label = filterRow.createDiv();
			label.textContent = t('modal.insertImage.filterLabel');
			label.style.fontSize = '12px';
			label.style.opacity = '0.7';

			const optionsContainer = filterRow.createDiv();
			optionsContainer.style.display = 'flex';
			optionsContainer.style.flexWrap = 'wrap';
			optionsContainer.style.gap = '6px';

			const renderChips = () => {
				optionsContainer.empty();

				const createChip = (text: string, folderId: string | null) => {
					const chip = optionsContainer.createDiv();
					chip.textContent = text;
					chip.style.padding = '2px 8px';
					chip.style.borderRadius = '999px';
					chip.style.cursor = 'pointer';
					chip.style.fontSize = '12px';
					chip.style.border = '1px solid var(--background-modifier-border)';

					const isActive = folderId === null
						? this.selectedFolderFilterIds.size === 0
						: this.selectedFolderFilterIds.has(folderId);

					if (isActive) {
						chip.style.backgroundColor = 'var(--interactive-accent)';
						chip.style.color = 'var(--text-on-accent)';
					}

					chip.onclick = async () => {
						if (folderId === null) {
							this.selectedFolderFilterIds.clear();
						} else {
							if (this.selectedFolderFilterIds.has(folderId)) {
								this.selectedFolderFilterIds.delete(folderId);
							} else {
								this.selectedFolderFilterIds.add(folderId);
							}
						}

						this.settings.selectedFolderFilterIds = Array.from(this.selectedFolderFilterIds);
						await this.plugin.saveSettings();

						renderChips();
						this.scheduleSearch();
					};
				};

				createChip(t('modal.insertImage.filterAll'), null);

				for (const filter of filters) {
					if (!filter.folderId) continue;
					const name = filter.name || filter.folderId;
					createChip(name, filter.folderId);
				}
			};

			renderChips();
		} else {
			this.selectedFolderFilterIds.clear();
		}

		this.infoEl = contentEl.createDiv();
		this.infoEl.style.marginBottom = '6px';
		this.infoEl.textContent = '';

		this.resultsContainer = contentEl.createDiv();
		this.resultsContainer.style.maxHeight = '420px';
		this.resultsContainer.style.overflowY = 'auto';
		this.resultsContainer.style.display = 'flex';
		this.resultsContainer.style.flexDirection = 'column';
		this.resultsContainer.style.gap = '6px';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private scheduleSearch() {
		if (this.searchTimer !== null) {
			window.clearTimeout(this.searchTimer);
		}
		this.searchTimer = window.setTimeout(() => {
			this.search();
		}, 250);
	}

	private async search() {
		const query = this.searchInput.value.trim();
		const lowerQuery = query.toLowerCase();
		const terms = lowerQuery.split(/\s+/).filter((v) => v.length > 0);

		this.resultsContainer.empty();
		this.currentItems = [];
		this.resultElements = [];
		this.selectedIndex = -1;

		if (!query) {
			this.infoEl.textContent = '';
			return;
		}

		this.infoEl.textContent = t('modal.insertImage.searching');

		const port = this.settings.port || 6060;
		const params = new URLSearchParams();
		// 增加 limit 以便在本地进行更准确的过滤（防止API只返回前200个导致漏掉匹配项）
		params.set('limit', '1000');
		params.set('orderBy', '-CREATEDATE');
		
		// 优化搜索逻辑：
		// Eagle API 的 keyword 参数可能对多词匹配（尤其是乱序）支持有限。
		// 策略：发送最长的关键词给 Eagle 以获取候选列表，然后在本地进行严格的多词匹配。
		// 这样可以实现 "A B" 匹配 "B A" 的效果，同时利用 Eagle 索引减少数据传输。
		const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
		const searchKeyword = sortedTerms.length > 0 ? sortedTerms[0] : '';
		params.set('keyword', searchKeyword);

		const folderIds = Array.from(this.selectedFolderFilterIds);
		if (folderIds.length > 0) {
			params.set('folders', folderIds.join(','));
		}
		
		params.set('t', Date.now().toString());

		const url = `http://localhost:${port}/api/item/list?${params.toString()}`;

		try {
			const response = await fetch(url);
			const result = await response.json();

			if (result.status !== 'success' || !Array.isArray(result.data)) {
				this.infoEl.textContent = t('modal.insertImage.noResult');
				return;
			}

			const exts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff'];

			const items = result.data.filter((item: any) => {
				if (!item || !item.name || !item.ext) return false;
				const ext = String(item.ext).toLowerCase();
				if (!exts.includes(ext)) return false;
				const name = String(item.name).toLowerCase();
				if (terms.length === 0) return true;
				return terms.every((term) => name.includes(term));
			});

			if (items.length === 0) {
				this.infoEl.textContent = t('modal.insertImage.noResult');
				return;
			}

			this.infoEl.textContent = '';
			this.renderResults(items, port);
		} catch (e) {
			print('InsertImageFromEagleModal search error', e);
			this.infoEl.textContent = t('modal.insertImage.noResult');
		}
	}

	private renderResults(items: any[], port: number) {
		this.resultsContainer.empty();
		this.currentItems = items;
		this.resultElements = [];
		this.currentPort = port;
		this.selectedIndex = -1;

		const maxItems = 200;
		for (let i = 0; i < items.length && i < maxItems; i++) {
			const item = items[i];
			const row = this.resultsContainer.createDiv();
			this.resultElements.push(row);

			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '10px';
			row.style.padding = '4px 6px';
			row.style.borderRadius = '4px';
			row.style.cursor = 'pointer';
			
			row.onmouseover = () => {
				if (this.selectedIndex !== i) {
					row.style.backgroundColor = 'var(--nav-item-background-hover)';
				}
			};
			row.onmouseout = () => {
				if (this.selectedIndex !== i) {
					row.style.backgroundColor = 'transparent';
				}
			};

			const thumbWrapper = row.createDiv();
			thumbWrapper.style.width = '80px';
			thumbWrapper.style.height = '80px';
			thumbWrapper.style.flex = '0 0 auto';
			thumbWrapper.style.display = 'flex';
			thumbWrapper.style.alignItems = 'center';
			thumbWrapper.style.justifyContent = 'center';
			thumbWrapper.style.overflow = 'hidden';
			thumbWrapper.style.borderRadius = '4px';
			thumbWrapper.style.backgroundColor = 'var(--background-secondary)';

			const img = thumbWrapper.createEl('img');
			// 使用本地服务器直接获取原图作为缩略图（解决 Eagle API 缩略图可能无法显示的问题）
			img.src = `http://localhost:${port}/images/${item.id}.info`;
			img.style.maxWidth = '100%';
			img.style.maxHeight = '100%';
			(img as any).style.objectFit = 'contain';

			const textWrapper = row.createDiv();
			textWrapper.style.display = 'flex';
			textWrapper.style.flexDirection = 'column';
			textWrapper.style.flex = '1 1 auto';
			textWrapper.style.minWidth = '0';

			const titleEl = textWrapper.createDiv();
			titleEl.textContent = item.name || item.id;
			titleEl.style.fontSize = '13px';
			titleEl.style.whiteSpace = 'nowrap';
			titleEl.style.overflow = 'hidden';
			titleEl.style.textOverflow = 'ellipsis';

			const infoEl = textWrapper.createDiv();
			infoEl.style.fontSize = '11px';
			infoEl.style.opacity = '0.7';
			infoEl.textContent = item.ext ? String(item.ext).toUpperCase() : '';

			row.onclick = () => {
				this.insertImage(item, port);
			};
		}
	}

	private moveSelection(direction: number) {
		if (this.resultElements.length === 0) return;
		
		const prevIndex = this.selectedIndex;
		this.selectedIndex += direction;
		
		if (this.selectedIndex < 0) this.selectedIndex = 0;
		if (this.selectedIndex >= this.resultElements.length) this.selectedIndex = this.resultElements.length - 1;
		
		if (prevIndex !== -1 && this.resultElements[prevIndex]) {
			this.resultElements[prevIndex].style.backgroundColor = 'transparent';
		}
		
		const el = this.resultElements[this.selectedIndex];
		if (el) {
			el.style.backgroundColor = 'var(--background-modifier-active-hover)';
			el.scrollIntoView({ block: 'nearest' });
		}
	}

	private insertImage(item: any, port: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice(t('modal.insertImage.noActiveEditor'));
			return;
		}
		const editor = view.editor;
		const size = this.settings.imageSize || '';
		const name = item.name || item.id;
		
		// 恢复为旧的链接格式，直接指向 .info 文件夹，由 server.ts 处理返回图片
		const url = `http://localhost:${port}/images/${item.id}.info`;
		
		// Alt 文本格式：标题.后缀|尺寸
		let alt = `${name}.${item.ext}`;
		if (size) {
			alt = `${alt}|${size}`;
		}
		const markdown = `![${alt}](${url})`;
		editor.replaceSelection(markdown);
		new Notice(t('modal.insertImage.insertSuccess'));
		this.close();
	}
}

export function openInsertImageFromEagleModal(plugin: MyPlugin) {
	new InsertImageFromEagleModal(plugin.app, plugin).open();
}
