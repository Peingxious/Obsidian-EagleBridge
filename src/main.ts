import {
	Menu,
	MenuItem,
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	Platform,
	FileStats,
	debounce,
} from "obsidian";
import { t } from "./i18n";
import { startServer, refreshServer, stopServer } from "./server";
import { handlePasteEvent, handleDropEvent } from "./urlHandler";
import { onElement } from "./onElement";
import { exec, spawn, execSync } from "child_process";
import * as path from "path";
import {
	addCommandSynchronizedPageTabs,
	addCommandEagleJump,
	addCommandInsertImageFromEagle,
	addCommandReverseSync,
} from "./addCommand-config";
import { existsSync } from "fs";
import {
	MyPluginSettings,
	DEFAULT_SETTINGS,
	SampleSettingTab,
} from "./setting";
import { handleImageClick, removeZoomedImage } from "./Leftclickimage";
import {
	handleLinkClick,
	eagleImageContextMenuCall,
	fetchImageInfo,
	findLinkInLine,
	replaceLinkTitle,
} from "./menucall";
import { isAltTextImage, isURL, isLocalHostLink } from "./embed";
import { embedManager } from "./embed";
import { embedField } from "./embed-state-field";
import { Extension } from "@codemirror/state";

let DEBUG = false;

export const print = (message?: any, ...optionalParams: any[]) => {
	// console.log('DEBUG status:', DEBUG); // 调试输出
	if (DEBUG) {
		console.log(message, ...optionalParams);
	}
};

export function setDebug(value: boolean) {
	DEBUG = value;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log("加载 eagle-image-organizer 插件");

		await this.loadSettings();

		// 注册编辑器扩展，务必正确导入和注册
		this.registerEditorExtension([embedField]);

		// 处理预览模式
		this.registerMarkdownPostProcessor((el, ctx) => {
			const images = el.querySelectorAll("img");
			images.forEach((image) => {
				if (embedManager.shouldEmbed(image.src)) {
					print(`MarkdownPostProcessor 找到可嵌入图像: ${image.src}`);
					this.handleImage(image);
				}
			});
		});

		// 注册外部文件支持
		// 注册图片右键菜单事件
		this.registerDocument(document);
		this.app.workspace.on("window-open", (workspaceWindow, window) => {
			this.registerDocument(window.document);
		});
		// 在插件加载时启动服务器
		startServer(this.settings.libraryPath, this.settings.port);
		// 添加设置面板
		this.addSettingTab(new SampleSettingTab(this.app, this));
		// await this.loadSettings();
		// 注册粘贴事件
		this.registerEvent(
			this.app.workspace.on(
				"editor-paste",
				(clipboard: ClipboardEvent, editor: Editor) => {
					handlePasteEvent(
						clipboard,
						editor,
						this.settings.port,
						this,
					);
				},
			),
		);
		// 注册拖拽事件
		this.registerEvent(
			this.app.workspace.on(
				"editor-drop",
				(event: DragEvent, editor: Editor) => {
					handleDropEvent(event, editor, this.settings.port, this);
				},
			),
		);
		// 在插件加载时设置 DEBUG 状态
		// console.log('Debug setting:', this.settings.debug);
		setDebug(this.settings.debug);

		this.registerDomEvent(
			document,
			"click",
			async (event: MouseEvent) => {
				const target = event.target as HTMLElement;
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView) {
					print("Cannot find the active view");
					return;
				}

				const inPreview = activeView.getMode() === "preview";
				let url: string | null = null;

				if (inPreview) {
					if (!target.matches("a.external-link")) {
						return;
					}

					const linkElement = target as HTMLAnchorElement;
					if (linkElement && linkElement.href) {
						url = linkElement.href;
						print(`Preview mode link: ${url}`);
					}
				} else {
					if (
						!target.matches(
							"span.external-link, .cm-link, a.cm-underline",
						)
					) {
						return;
					}

					const editor = activeView.editor;
					const cursor = editor.getCursor();
					const lineText = editor.getLine(cursor.line);
					const urlMatches = Array.from(
						lineText.matchAll(/\bhttps?:\/\/[^\s)]+/g),
					);
					print(urlMatches);
					let closestUrl = null;
					let minDistance = Infinity;
					const cursorPos = cursor.ch;
					print(cursorPos);

					for (let i = 0; i < urlMatches.length; i++) {
						const match = urlMatches[i];
						const end = (match.index || 0) + match[0].length + 1;
						if (cursorPos <= end) {
							closestUrl = match[0];
							print(`Cursor is in the link interval: ${i + 1}`);
							break;
						}
					}

					if (closestUrl) {
						url = closestUrl;
						print(`Edit mode link: ${url}`);
					}
				}

				if (
					url &&
					url.match(/^http:\/\/localhost:\d+\/images\/[^.]+\.info$/)
				) {
					event.preventDefault();
					event.stopPropagation();
					print(`Prevented link: ${url}`);
					handleLinkClick(this, event, url);
				} else {
					return;
				}
			},
			{ capture: true },
		);
		// 注册点击事件(参考AttachFlow)
		this.registerDomEvent(document, "click", async (evt: MouseEvent) => {
			if (!this.settings.clickView) return;
			handleImageClick(evt, this.settings.adaptiveRatio);
		});

		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape") {
				removeZoomedImage();
			}
		});
		// 注册命令
		addCommandSynchronizedPageTabs(this);
		addCommandEagleJump(this);
		addCommandInsertImageFromEagle(this);
		addCommandReverseSync(this);

		// 注册事件
		this.registerEvent(
			this.app.workspace.on(
				"active-leaf-change",
				debounce(async (leaf) => {
					if (leaf?.view instanceof MarkdownView) {
						await this.reverseSync(
							leaf.view as MarkdownView,
							false,
							true,
						);
					}
				}, 200),
			),
		);
		// 添加自定义样式，确保样式包含编辑模式特定样式
	}

	onunload() {
		// 在插件卸载时停止服务器
		stopServer();
		// this.app.vault.getResourcePath = this.originalGetResourcePath;
		// this.app.metadataCache.getFirstLinkpathDest = this.originalGetFirstLinkpathDest;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		await this.updateLibraryPath();
	}

	async updateLibraryPath() {
		if (!this.settings.libraries || this.settings.libraries.length === 0) {
			const legacyPaths =
				this.settings.libraryPaths &&
				this.settings.libraryPaths.length > 0
					? this.settings.libraryPaths
					: this.settings.libraryPath
						? [this.settings.libraryPath]
						: [];
			const id = `default-${Date.now()}`;
			this.settings.libraries = [
				{
					id,
					name: "Default",
					paths: legacyPaths,
				},
			];
			this.settings.currentLibraryId = id;
		}

		const libraries = this.settings.libraries;
		let active = libraries.find(
			(l) => l.id === this.settings.currentLibraryId,
		);
		if (!active) {
			active = libraries[0];
			this.settings.currentLibraryId = active.id;
		}

		if (!active.paths || active.paths.length === 0) {
			const fallback = this.settings.libraryPath
				? [this.settings.libraryPath]
				: [];
			active.paths = fallback;
		}

		let selectedPath = active.paths[0] || "";
		for (const p of active.paths) {
			if (p && existsSync(p)) {
				selectedPath = p;
				break;
			}
		}

		this.settings.libraryPath = selectedPath;
		this.settings.libraryPaths = active.paths.slice();
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	// 注册图片右键菜单事件
	registerDocument(document: Document) {
		this.register(
			onElement(
				document,
				"contextmenu",
				"img",
				eagleImageContextMenuCall.bind(this),
				{ capture: true },
			),
		);
	}
	handleImage(img: HTMLImageElement): HTMLElement | null {
		try {
			const alt = img.alt || "";
			const src = img.src;

			// print(`处理图像: ${src} 替代文本: ${alt}`);

			// 检查是否有 noembed 标记
			if (/noembed/i.test(alt)) {
				img.alt = alt.replace(/noembed/i, "").trim();
				// print("跳过嵌入: 图像标记为noembed");
				return null;
			}

			// 检查alt文本是否表示图片类型
			if (isAltTextImage(alt)) {
				// print(`根据alt文本识别为图片，跳过: ${alt}`);
				return null;
			}

			// 检查是否应该嵌入
			if (!isURL(src) || !embedManager.shouldEmbed(src, alt)) {
				// print("跳过嵌入: 不是有效URL或不应嵌入");
				return null;
			}

			// print(`创建嵌入内容: ${src}`);
			const embedResult = embedManager.create(src);
			const container = embedResult.containerEl;

			if (!img.parentElement) {
				// print("错误: 图像没有父元素");
				return null;
			}

			// 使用替换方法
			img.parentElement.replaceChild(container, img);

			return container;
		} catch (error) {
			console.error("处理图像时出错:", error);
			return null;
		}
	}

	async reverseSync(
		view: MarkdownView,
		force: boolean = false,
		silent: boolean = false,
	) {
		if (!this.settings.reverseSyncOnOpen && !force) return;

		const editor = view.editor;
		const lineCount = editor.lineCount();
		const port = this.settings.port;
		const infoCache = new Map<string, any>();

		let matchCount = 0;
		let updateCount = 0;

		// First pass: scan for any matches to avoid overhead if none exist
		// This is a quick check.
		const docContent = editor.getValue();
		if (!docContent.includes(`http://localhost:${port}/images/`)) {
			return;
		}

		if (!silent) {
			new Notice(t("reverseSync.checking"));
		}

		for (let i = 0; i < lineCount; i++) {
			let lineText = editor.getLine(i);
			const originalLineText = lineText;

			// Regex to find Eagle links
			const urlRegex = new RegExp(
				`http://localhost:${port}/images/([^\\.]+)\\.info`,
				"g",
			);
			let match;
			const matches = [];
			while ((match = urlRegex.exec(lineText)) !== null) {
				matches.push({ url: match[0], id: match[1] });
			}

			if (matches.length === 0) continue;
			matchCount += matches.length;

			let linkRanges: {
				start: number;
				end: number;
				url: string;
				id: string;
			}[] = [];

			for (const m of matches) {
				const finds = findLinkInLine(m.url, lineText);
				for (const [start, end] of finds) {
					linkRanges.push({ start, end, url: m.url, id: m.id });
				}
			}

			// Deduplicate by start index
			const uniqueRanges = new Map();
			for (const r of linkRanges) {
				uniqueRanges.set(r.start, r);
			}
			linkRanges = Array.from(uniqueRanges.values());

			// Sort by start index descending (right to left)
			linkRanges.sort((a, b) => b.start - a.start);

			let lineChanged = false;

			for (const range of linkRanges) {
				let info = infoCache.get(range.id);
				if (!info) {
					info = await fetchImageInfo(range.url, port);
					if (info) {
						infoCache.set(range.id, info);
					} else {
						new Notice(
							t("reverseSync.fetchFailed", { id: range.id }),
						);
					}
				}

				if (info) {
					const currentLinkText = lineText.slice(
						range.start,
						range.end,
					);
					const newLinkText = replaceLinkTitle(
						currentLinkText,
						info.name,
						info.ext,
					);

					if (currentLinkText !== newLinkText) {
						lineText =
							lineText.slice(0, range.start) +
							newLinkText +
							lineText.slice(range.end);
						lineChanged = true;
						updateCount++;
					}
				} else {
					print(`Failed to fetch info for ID: ${range.id}`);
				}
			}

			if (lineChanged) {
				editor.replaceRange(
					lineText,
					{ line: i, ch: 0 },
					{ line: i, ch: originalLineText.length },
				);
			}
		}

		if (updateCount > 0) {
			new Notice(
				t("reverseSync.complete", { count: updateCount.toString() }),
			);
		} else if (matchCount > 0 && !silent) {
			new Notice(t("reverseSync.upToDate"));
		}
	}
}
