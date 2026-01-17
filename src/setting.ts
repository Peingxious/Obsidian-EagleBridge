import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from './main';
import { startServer, refreshServer, stopServer } from './server';
import { t } from './i18n';

export interface EagleLibrary {
	id: string;
	name: string;
	paths: string[];
}

export interface FolderFilterConfig {
	name: string;
	folderId: string;
	includeSubfolders?: boolean;
}

export interface MyPluginSettings {
	mySetting: string;
	port: number;
	libraryPath: string;
	folderId?: string;
	folderScope: string;
	folderFilters?: FolderFilterConfig[];
	selectedFolderFilterIds?: string[];
	clickView: boolean;
	adaptiveRatio: number;
	advancedID: boolean;
	obsidianStoreId: string;
	imageSize: number | undefined;
	websiteUpload: boolean;
	libraryPaths: string[];
	debug: boolean;
	openInObsidian: string;
	libraries?: EagleLibrary[];
	currentLibraryId?: string;
	archivedTags?: string[];
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	port: 6060,
	libraryPath: '',
	folderId: '',
	clickView: false,
	adaptiveRatio: 0.8,
	advancedID: false,
	obsidianStoreId: '',
	imageSize: undefined,
	websiteUpload: false,
	libraryPaths: [],
	folderScope: '',
	folderFilters: [],
	selectedFolderFilterIds: [],
	debug: false,
	openInObsidian: 'newPage',
	libraries: [],
	currentLibraryId: undefined,
	archivedTags: [],
}


export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	private librariesCollapsed: boolean = true;
	private idGroupCollapsed: boolean = true;
	private imageGroupCollapsed: boolean = true;
	private advGroupCollapsed: boolean = true;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('setting.port.name'))
			.setDesc(t('setting.port.desc'))
			.addText(text => text
				.setPlaceholder(t('setting.port.placeholder'))
				.setValue(this.plugin.settings.port.toString())
				.onChange(async (value) => {
					this.plugin.settings.port = parseInt(value);
					await this.plugin.saveSettings();
				}));

		const librariesSection = containerEl.createDiv();
		librariesSection.setAttr('data-eagle-libraries', 'true');
		librariesSection.style.marginTop = '12px';

		const librariesHeaderRow = librariesSection.createDiv();
		librariesHeaderRow.style.display = 'flex';
		librariesHeaderRow.style.alignItems = 'center';
		librariesHeaderRow.style.gap = '8px';
		librariesHeaderRow.style.justifyContent = 'space-between';

		const librariesHeaderLeft = librariesHeaderRow.createDiv();
		librariesHeaderLeft.style.display = 'flex';
		librariesHeaderLeft.style.alignItems = 'center';
		librariesHeaderLeft.style.gap = '8px';

		const librariesToggleDiv = librariesHeaderLeft.createDiv();
		librariesToggleDiv.textContent = this.librariesCollapsed ? '▸' : '▾';
		librariesToggleDiv.style.cursor = 'pointer';
		librariesToggleDiv.style.display = 'flex';
		librariesToggleDiv.style.alignItems = 'center';
		librariesToggleDiv.style.justifyContent = 'center';
		librariesToggleDiv.style.width = '22px';
		librariesToggleDiv.style.height = '22px';
		librariesToggleDiv.style.fontSize = '18px';

		const librariesTextWrapper = librariesHeaderLeft.createDiv();
		librariesTextWrapper.style.display = 'flex';
		librariesTextWrapper.style.flexDirection = 'column';

		const librariesTitleDiv = librariesTextWrapper.createDiv({ cls: 'setting-item-name' });
		librariesTitleDiv.textContent = t('setting.libraries.title');

		const librariesDescDiv = librariesTextWrapper.createDiv({ cls: 'setting-item-description' });
		librariesDescDiv.textContent = t('setting.libraries.desc', { path: this.plugin.settings.libraryPath || '' });

		librariesToggleDiv.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.librariesCollapsed = !this.librariesCollapsed;
			this.display();
		});

		const addLibraryButton = librariesHeaderRow.createEl('button', { text: t('setting.libraries.addLibrary') });
		addLibraryButton.classList.add('mod-cta');
		addLibraryButton.onclick = async () => {
			if (!this.plugin.settings.libraries) {
				this.plugin.settings.libraries = [];
			}
			const id = `lib-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
			this.plugin.settings.libraries.push({
				id,
				name: t('setting.libraries.defaultName'),
				paths: [],
			});
			this.plugin.settings.currentLibraryId = id;
			await this.plugin.saveSettings();
			await this.plugin.updateLibraryPath();
			this.display();
		};

		const librariesDetails = librariesSection.createDiv();
		if (this.librariesCollapsed) {
			librariesDetails.style.display = 'none';
		}

		const libraries = this.plugin.settings.libraries || [];
		libraries.forEach((lib, index) => {
			const libContainer = librariesDetails.createDiv();
			if (index === 0) {
				libContainer.style.marginTop = '20px';
				libContainer.style.backgroundColor = 'var(--setting-items-background)';
			}
			libContainer.addClass('eagle-library-item');
			if (lib.id === this.plugin.settings.currentLibraryId) {
				libContainer.addClass('eagle-library-active');
			}

			const header = new Setting(libContainer)
				.setClass('eagle-library-header')
				.setName(t('setting.libraries.libraryName'))
				.addText(text => text
					.setPlaceholder(t('setting.libraries.libraryName'))
					.setValue(lib.name)
					.onChange(async (value) => {
						lib.name = value;
						await this.plugin.saveSettings();
					}));

			header.addExtraButton(button => {
				const isActive = lib.id === this.plugin.settings.currentLibraryId;
				button.setIcon(isActive ? 'check' : 'arrow-right');
				button.setTooltip(isActive ? t('setting.libraries.active') : t('setting.libraries.setActive'));
				if (isActive) {
					button.extraSettingsEl.addClass('eagle-active-icon');
				}
				button.onClick(async () => {
					this.plugin.settings.currentLibraryId = lib.id;
					await this.plugin.saveSettings();
					await this.plugin.updateLibraryPath();
					this.display();
				});
			});

			header.addExtraButton(button => {
				button.setIcon('plus-with-circle');
				button.setTooltip(t('setting.libraryPaths.add'));
				button.onClick(async () => {
					lib.paths.push('');
					await this.plugin.saveSettings();
					this.display();
				});
			});

			header.addExtraButton(button => {
				button.setIcon('trash');
				button.setTooltip(t('setting.libraries.removeLibrary'));
				button.onClick(async () => {
					if (!this.plugin.settings.libraries) {
						return;
					}
					if (this.plugin.settings.libraries.length <= 1) {
						return;
					}
					this.plugin.settings.libraries.splice(index, 1);
					if (this.plugin.settings.currentLibraryId === lib.id) {
						const first = this.plugin.settings.libraries[0];
						this.plugin.settings.currentLibraryId = first.id;
					}
					await this.plugin.saveSettings();
					await this.plugin.updateLibraryPath();
					this.display();
				});
			});

			lib.paths.forEach((p, pathIndex) => {
				new Setting(libContainer)
					.setClass('eagle-path-setting')
					.addText(text => text
						.setPlaceholder(t('setting.libraryPaths.pathPlaceholder'))
						.setValue(p)
						.onChange(async (value) => {
							lib.paths[pathIndex] = value;
							await this.plugin.saveSettings();
							await this.plugin.updateLibraryPath();
						}))
					.addExtraButton(button => {
						button.setIcon('cross')
						.setTooltip(t('setting.libraryPaths.remove'))
						.onClick(async () => {
							lib.paths.splice(pathIndex, 1);
							await this.plugin.saveSettings();
							await this.plugin.updateLibraryPath();
							this.display();
						});
					});
			});
		});

		const idGroup = containerEl.createDiv();
		idGroup.style.marginTop = '20px';
		const idHeaderRow = idGroup.createDiv();
		idHeaderRow.style.display = 'flex';
		idHeaderRow.style.alignItems = 'center';
		idHeaderRow.style.gap = '8px';

		const idToggleDiv = idHeaderRow.createDiv();
		idToggleDiv.textContent = this.idGroupCollapsed ? '▸' : '▾';
		idToggleDiv.style.cursor = 'pointer';
		idToggleDiv.style.display = 'flex';
		idToggleDiv.style.alignItems = 'center';
		idToggleDiv.style.justifyContent = 'center';
		idToggleDiv.style.width = '22px';
		idToggleDiv.style.height = '22px';
		idToggleDiv.style.fontSize = '18px';

		const idTextWrapper = idHeaderRow.createDiv();
		idTextWrapper.style.display = 'flex';
		idTextWrapper.style.flexDirection = 'column';

		const idTitleDiv = idTextWrapper.createDiv({ cls: 'setting-item-name' });
		idTitleDiv.textContent = t('setting.group.id.title');

		const idDescDiv = idTextWrapper.createDiv({ cls: 'setting-item-description' });
		idDescDiv.textContent = t('setting.group.id.desc');

		idToggleDiv.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.idGroupCollapsed = !this.idGroupCollapsed;
			this.display();
		});

		const idBody = idGroup.createDiv();
		if (this.idGroupCollapsed) {
			idBody.style.display = 'none';
		}

		const folderIdSetting = new Setting(idBody)
			.setName(t('setting.folderId.name'))
			.setDesc(t('setting.folderId.desc'))
			.addText(text => text
				.setPlaceholder(t('setting.folderId.placeholder'))
				.setValue(this.plugin.settings.folderId || '')
				.onChange(async (value) => {
					this.plugin.settings.folderId = value;
					await this.plugin.saveSettings();
				}));

		(folderIdSetting as any).settingEl.style.marginTop = '10px';

		new Setting(idBody)
			.setName(t('setting.folderScope.name'))
			.setDesc(t('setting.folderScope.desc'))
			.addText(text => text
				.setPlaceholder(t('setting.folderScope.placeholder'))
				.setValue(this.plugin.settings.folderScope || '')
				.onChange(async (value) => {
					this.plugin.settings.folderScope = value;
					await this.plugin.saveSettings();
				}));

		const filterBlock = idBody.createDiv();
		filterBlock.style.marginTop = '6px';
		filterBlock.style.padding = '8px 10px';
		filterBlock.style.borderRadius = '8px';
		filterBlock.style.backgroundColor = 'var(--setting-items-background)';

		const filterHeader = filterBlock.createDiv();
		filterHeader.style.display = 'flex';
		filterHeader.style.alignItems = 'center';
		filterHeader.style.justifyContent = 'space-between';
		filterHeader.style.gap = '8px';

		const filterTextWrapper = filterHeader.createDiv();
		filterTextWrapper.style.display = 'flex';
		filterTextWrapper.style.flexDirection = 'column';

		const filterTitle = filterTextWrapper.createDiv({ cls: 'setting-item-name' });
		filterTitle.textContent = t('setting.folderFilter.title');
		const filterDesc = filterTextWrapper.createDiv({ cls: 'setting-item-description' });
		filterDesc.textContent = t('setting.folderFilter.desc');

		const addFilterButton = filterHeader.createEl('button', { text: t('setting.folderFilter.add') });
		addFilterButton.classList.add('mod-cta');
		addFilterButton.onclick = async () => {
			if (!this.plugin.settings.folderFilters) {
				this.plugin.settings.folderFilters = [];
			}
			this.plugin.settings.folderFilters.push({
				name: '',
				folderId: '',
				includeSubfolders: true,
			});
			await this.plugin.saveSettings();
			this.display();
		};

		if (!this.plugin.settings.folderFilters) {
			this.plugin.settings.folderFilters = [];
		}

		const filterContainer = filterBlock.createDiv();
		filterContainer.style.marginTop = '5px';

		const filters = this.plugin.settings.folderFilters;

		filters.forEach((filter, index) => {
			const row = new Setting(filterContainer).setClass('eagle-path-setting');
			row.addText(text => {
				text.setPlaceholder(t('setting.folderFilter.namePlaceholder'));
				text.setValue(filter.name || '');
				text.onChange(async (value) => {
					filter.name = value;
					await this.plugin.saveSettings();
				});
			});
			row.addText(text => {
				text.setPlaceholder(t('setting.folderFilter.idPlaceholder'));
				text.setValue(filter.folderId || '');
				text.onChange(async (value) => {
					filter.folderId = value;
					await this.plugin.saveSettings();
				});
			});
			row.addExtraButton(button => {
				const active = filter.includeSubfolders !== false;
				button.setIcon('check');
				button.setTooltip(t('setting.folderFilter.includeSubfolders'));
				button.extraSettingsEl.addClass('eagle-subfolder-toggle');
				if (active) {
					button.extraSettingsEl.addClass('eagle-subfolder-active');
				} else {
					button.extraSettingsEl.removeClass('eagle-subfolder-active');
				}
				button.onClick(async () => {
					const current = filter.includeSubfolders !== false;
					filter.includeSubfolders = !current;
					await this.plugin.saveSettings();
					this.display();
				});
			});
			row.addExtraButton(button => {
				button.setIcon('trash');
				button.setTooltip(t('setting.folderFilter.remove'));
				button.onClick(async () => {
					filters.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});
			});

			const rowEl = (row as any).settingEl as HTMLElement;
			rowEl.style.marginTop = '6px';
			const infoEl = rowEl.querySelector('.setting-item-info') as HTMLElement | null;
			if (infoEl) {
				infoEl.style.display = 'none';
			}
		});

		const imageGroup = containerEl.createDiv();
		imageGroup.style.marginTop = '20px';
		const imageHeaderRow = imageGroup.createDiv();
		imageHeaderRow.style.display = 'flex';
		imageHeaderRow.style.alignItems = 'center';
		imageHeaderRow.style.gap = '8px';

		const imageToggleDiv = imageHeaderRow.createDiv();
		imageToggleDiv.textContent = this.imageGroupCollapsed ? '▸' : '▾';
		imageToggleDiv.style.cursor = 'pointer';
		imageToggleDiv.style.display = 'flex';
		imageToggleDiv.style.alignItems = 'center';
		imageToggleDiv.style.justifyContent = 'center';
		imageToggleDiv.style.width = '22px';
		imageToggleDiv.style.height = '22px';
		imageToggleDiv.style.fontSize = '18px';

		const imageTextWrapper = imageHeaderRow.createDiv();
		imageTextWrapper.style.display = 'flex';
		imageTextWrapper.style.flexDirection = 'column';

		const imageTitleDiv = imageTextWrapper.createDiv({ cls: 'setting-item-name' });
		imageTitleDiv.textContent = t('setting.group.image.title');

		const imageDescDiv = imageTextWrapper.createDiv({ cls: 'setting-item-description' });
		imageDescDiv.textContent = t('setting.group.image.desc');

		imageToggleDiv.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.imageGroupCollapsed = !this.imageGroupCollapsed;
			this.display();
		});

		const imageBody = imageGroup.createDiv();
		if (this.imageGroupCollapsed) {
			imageBody.style.display = 'none';
		}

		const imageSizeSetting = new Setting(imageBody)
			.setName(t('setting.imageSize.name'))
			.setDesc(t('setting.imageSize.desc'))
			.addText(text => text
				.setPlaceholder(t('setting.imageSize.placeholder'))
				.setValue(this.plugin.settings.imageSize?.toString() || '')
				.onChange(async (value) => {
					this.plugin.settings.imageSize = value ? parseInt(value) : undefined;
					await this.plugin.saveSettings();
				}));

		(imageSizeSetting as any).settingEl.style.marginTop = '10px';

		new Setting(imageBody)
			.setName(t('setting.clickView.name'))
			.setDesc(t('setting.clickView.desc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.clickView)
					.onChange(async (value) => {
						this.plugin.settings.clickView = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(imageBody)
			.setName(t('setting.adaptiveRatio.name'))
			.setDesc(t('setting.adaptiveRatio.desc'))
			.addSlider((slider) => {
				slider.setLimits(0.1, 1, 0.05);
				slider.setValue(this.plugin.settings.adaptiveRatio);
				slider.onChange(async (value) => {
					this.plugin.settings.adaptiveRatio = value;
					new Notice(t('setting.adaptiveRatio.notice', { value }));
					await this.plugin.saveSettings();
				});
				slider.setDynamicTooltip();
			});

		new Setting(imageBody)
			.setName(t('setting.openInObsidian.name'))
			.setDesc(t('setting.openInObsidian.desc'))
			.addDropdown(dropdown => {
				dropdown.addOption('newPage', t('setting.openInObsidian.newPage'))
					.addOption('popup', t('setting.openInObsidian.popup'))
					.addOption('rightPane', t('setting.openInObsidian.rightPane'))
					.setValue(this.plugin.settings.openInObsidian || 'newPage')
					.onChange(async (value) => {
						this.plugin.settings.openInObsidian = value;
						await this.plugin.saveSettings();
					});
			});

		const advGroup = containerEl.createDiv();
		advGroup.style.margin = '20px 0';
		const advHeaderRow = advGroup.createDiv();
		advHeaderRow.style.display = 'flex';
		advHeaderRow.style.alignItems = 'center';
		advHeaderRow.style.gap = '8px';

		const advToggleDiv = advHeaderRow.createDiv();
		advToggleDiv.textContent = this.advGroupCollapsed ? '▸' : '▾';
		advToggleDiv.style.cursor = 'pointer';
		advToggleDiv.style.display = 'flex';
		advToggleDiv.style.alignItems = 'center';
		advToggleDiv.style.justifyContent = 'center';
		advToggleDiv.style.width = '22px';
		advToggleDiv.style.height = '22px';
		advToggleDiv.style.fontSize = '18px';

		const advTextWrapper = advHeaderRow.createDiv();
		advTextWrapper.style.display = 'flex';
		advTextWrapper.style.flexDirection = 'column';

		const advTitleDiv = advTextWrapper.createDiv({ cls: 'setting-item-name' });
		advTitleDiv.textContent = t('setting.group.advUri.title');

		const advDescDiv = advTextWrapper.createDiv({ cls: 'setting-item-description' });
		advDescDiv.textContent = t('setting.group.advUri.desc');

		advToggleDiv.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.advGroupCollapsed = !this.advGroupCollapsed;
			this.display();
		});

		const advBody = advGroup.createDiv();
		if (this.advGroupCollapsed) {
			advBody.style.display = 'none';
		}

		const advToggleSetting = new Setting(advBody)
			.setName(t('setting.advancedId.name'))
			.setDesc(t('setting.advancedId.desc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.advancedID)
					.onChange(async (value) => {
						this.plugin.settings.advancedID = value;
						await this.plugin.saveSettings();
					});
			});

		(advToggleSetting as any).settingEl.style.marginTop = '10px';

		new Setting(advBody)
			.setName(t('setting.obsidianStoreId.name'))
			.setDesc(t('setting.obsidianStoreId.desc'))
			.addText(text => text
				.setPlaceholder(t('setting.obsidianStoreId.placeholder'))
				.setValue(this.plugin.settings.obsidianStoreId)
				.onChange(async (value) => {
					this.plugin.settings.obsidianStoreId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName(t('setting.websiteUpload.name'))
		.setDesc(t('setting.websiteUpload.desc'))
		.addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.websiteUpload)
				.onChange(async (value) => {
					this.plugin.settings.websiteUpload = value;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl)
			.setName(t('setting.refreshServer.name'))
			.setDesc(t('setting.refreshServer.desc'))
			.addButton(button => button
				.setButtonText(t('setting.refreshServer.button'))
				.onClick(() => {
					refreshServer(this.plugin.settings.libraryPath, this.plugin.settings.port);
				}));

		new Setting(containerEl)
			.setName(t('setting.debug.name'))
			.setDesc(t('setting.debug.desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debug)
				.onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				}));
			
	}
}
