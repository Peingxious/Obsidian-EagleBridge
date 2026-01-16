import { Menu, MenuItem, MarkdownView, Notice, Modal, App, Setting } from 'obsidian';
import MyPlugin from './main';
import * as path from 'path';
import { onElement } from './onElement';
import { print, setDebug } from './main';
import { exec, spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { EditorView} from '@codemirror/view';
import { t } from './i18n';
import { FolderSelectModal } from './FolderSelectModal';
import { ModifyPropertiesModal } from './ModifyPropertiesModal';

export function handleLinkClick(plugin: MyPlugin, event: MouseEvent, url: string) {
	const menu = new Menu();
	const inPreview = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
	const topLevelActions: Array<() => void> = [];
	if (inPreview) {
		addEagleImageMenuPreviewMode(plugin, menu, url, event, false, topLevelActions);
	} else {
		addEagleImageMenuSourceMode(plugin, menu, url, event, topLevelActions);
	}
	registerEscapeButton(plugin, menu);
	menu.register(
		onElement(
			activeDocument,
			"keydown" as keyof HTMLElementEventMap,
			"*",
			(e: KeyboardEvent) => {
				if (e.key >= "1" && e.key <= "9") {
					const index = parseInt(e.key, 10) - 1;
					const action = topLevelActions[index];
					if (action) {
						e.preventDefault();
						e.stopPropagation();
						action();
						menu.hide();
					}
				}
			}
		)
	);
	let offset = 0;
	menu.showAtPosition({ x: event.pageX, y: event.pageY + offset });
}

export function eagleImageContextMenuCall(this: MyPlugin, event: MouseEvent) {
	const img = event.target as HTMLImageElement;
	const inTable: boolean = img.closest('table') != null;
	const inCallout: boolean = img.closest('.callout') != null;
	if (img.id == 'af-zoomed-image') return;
	if (!img.src.startsWith('http')) return;
    event.preventDefault();
	event.stopPropagation();
	this.app.workspace.getActiveViewOfType(MarkdownView)?.editor?.blur();
	img.classList.remove('image-ready-click-view', 'image-ready-resize');
	const url = img.src;
	const menu = new Menu();
	const inPreview = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
	const topLevelActions: Array<() => void> = [];
	if (inPreview) {
		addEagleImageMenuPreviewMode(this, menu, url, event, false, topLevelActions);
	} else {
		addEagleImageMenuSourceMode(this, menu, url, event, topLevelActions);
	}
	registerEscapeButton(this, menu);
	menu.register(
		onElement(
			activeDocument,
			"keydown" as keyof HTMLElementEventMap,
			"*",
			(e: KeyboardEvent) => {
				if (e.key >= "1" && e.key <= "9") {
					const index = parseInt(e.key, 10) - 1;
					const action = topLevelActions[index];
					if (action) {
						e.preventDefault();
						e.stopPropagation();
						action();
						menu.hide();
					}
				}
			}
		)
	);
	let offset = 0;
	if (!inPreview && (inTable || inCallout)) offset = -138;
	menu.showAtPosition({ x: event.pageX, y: event.pageY + offset });
}

export function registerEscapeButton(plugin: MyPlugin, menu: Menu, document: Document = activeDocument) {
	menu.register(
		onElement(
			document,
			"keydown" as keyof HTMLElementEventMap,
			"*",
			(e: KeyboardEvent) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					menu.hide();
				}
			}
		)
	);
}

export async function addEagleImageMenuPreviewMode(plugin: MyPlugin, menu: Menu, oburl: string, event: MouseEvent, isSourceMode: boolean = false, topLevelActions?: Array<() => void>) {
	const imageInfo = await fetchImageInfo(oburl);

    if (imageInfo) {
        const { id, name, ext, annotation, tags, url, folders } = imageInfo;
        const openInEagle = () => {
            const eagleLink = `eagle://item/${id}`;
            navigator.clipboard.writeText(eagleLink);
            window.open(eagleLink, '_self');
        };
        const copyEagleUrl = () => {
            navigator.clipboard.writeText(url);
            new Notice(t('menu.copyToClipboardSuccess'));
        };
        const openEagleHttpUrl = () => {
            window.open(url, '_self');
        };
        
        // Open File Submenu / Primary: 在 Eagle 中打开
        menu.addItem((item: MenuItem) => {
            const defaultAction = () => {
                openInEagle();
            };
            item
                .setTitle(t('menu.openFileSubmenu'))
                .setIcon("file-symlink")
                .onClick(defaultAction);

            if (topLevelActions) {
                topLevelActions.push(defaultAction);
            }
            
            const subMenu = (item as any).setSubmenu() as Menu;

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("file-symlink")
                    .setTitle(t('menu.openInObsidian'))
                    .onClick(async (event: MouseEvent) => {
                        // 根据设置决定如何打开链接
                        const openMethod = plugin.settings.openInObsidian || 'newPage';
                        
                        if (openMethod === 'newPage') {
                            // 在新页面打开（默认行为）
                            window.open(oburl, '_blank');
                        } else if (openMethod === 'popup') {
                            // 使用 Obsidian 的独立窗口打开
                            const leaf = plugin.app.workspace.getLeaf('window');
                            await leaf.setViewState({
                                type: 'webviewer',
                                state: {
                                    url: oburl,
                                    navigate: true,
                                },
                                active: true,
                            });
                        } else if (openMethod === 'rightPane') {
                            // 在右侧新栏中打开
                            const leaf = plugin.app.workspace.getLeaf('split', 'vertical');
                            await leaf.setViewState({
                                type: 'webviewer',
                                state: {
                                    url: oburl,
                                    navigate: true,
                                },
                                active: true,
                            });
                        }
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("file-symlink")
                    .setTitle(t('menu.openInEagle'))
                    .onClick(() => {
                        openInEagle();
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("folder")
                    .setTitle(t('menu.openContainingFolder'))
                    .onClick(() => {
                        const libraryPath = plugin.settings.libraryPath;
                        const dirPath = path.join(
                            libraryPath,
                            "images",
                            `${id}.info`
                        );
                        const child = spawn('explorer.exe', [dirPath], { shell: true });
                        child.on('error', (error) => {
                            print('Error opening folder:', error);
                            new Notice(t('menu.cannotOpenFile'));
                        });
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("square-arrow-out-up-right")
                    .setTitle(t('menu.openInDefaultApp'))
                    .onClick(() => {
                        const libraryPath = plugin.settings.libraryPath;
                        const localFilePath = path.join(
                            libraryPath,
                            "images",
                            `${id}.info`,
                            `${name}.${ext}`
                        );
            
                        new Notice(localFilePath);
                        // print(`文件的真实路径是: ${localFilePath}`);
            
                        // 使用 spawn 调用 explorer.exe 打开文件
                        const child = spawn('explorer.exe', [localFilePath], { shell: true });
                        child.on('error', (error) => {
                            print('Error opening file:', error);
                            new Notice(t('menu.cannotOpenFile'));
                        });

                        child.on('exit', (code) => {
                            if (code === 0) {
                                print('The file has been opened successfully');
                            } else {
                                print(`The file cannot be opened normally, exit code: ${code}`);
                            }
                        });
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("external-link")
                    .setTitle(t('menu.openInOtherApps'))
                    .onClick(() => {
                        const libraryPath = plugin.settings.libraryPath;
                        const localFilePath = path.join(
                            libraryPath,
                            "images",
                            `${id}.info`,
                            `${name}.${ext}`
                        );
            
                        new Notice(localFilePath);
                        // print(`文件的真实路径是: ${localFilePath}`);
            
                        // 使用 rundll32 调用系统的"打开方式"对话框
                        const child = spawn('rundll32', ['shell32.dll,OpenAs_RunDLL', localFilePath], { shell: true });

                        child.on('error', (error) => {
                            print('Error opening file:', error);
                            new Notice(t('menu.cannotOpenFile'));
                        });

                        child.on('exit', (code) => {
                            if (code === 0) {
                                print('The file has been opened successfully');
                            } else {
                                print(`The file cannot be opened normally, exit code: ${code}`);
                            }
                        });
                    })
            );
        });
        
        // 预先计算 tags 数组，供复制数据和修改属性共用
        const tagsArray = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());

        // Copy Data Submenu / Primary: 打开链接
        menu.addItem((item: MenuItem) => {
            const defaultAction = () => {
                openEagleHttpUrl();
            };
            item
                .setTitle(t('menu.copyDataSubmenu'))
                .setIcon("copy")
                .onClick(defaultAction);

            if (topLevelActions) {
                topLevelActions.push(defaultAction);
            }
            
            const subMenu = (item as any).setSubmenu() as Menu;

            // 复制源文件
            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("copy")
                    .setTitle(t('menu.copySourceFile'))
                    .onClick(() => {
                        const libraryPath = plugin.settings.libraryPath;
                        const localFilePath = path.join(
                            libraryPath,
                            "images",
                            `${id}.info`,
                            `${name}.${ext}`
                        );
                        try {
                            copyFileToClipboardCMD(localFilePath);
                            new Notice(t('menu.copyToClipboardSuccess'), 3000);
                        } catch (error) {
                            console.error(error);
                            new Notice(t('menu.copyToClipboardFailed'), 3000);
                        }
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("case-sensitive")
                    .setTitle(t('menu.eagleName', { name }))
                    .onClick(() => {
                        navigator.clipboard.writeText(name);
                        new Notice(t('menu.copyToClipboardSuccess'));
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("letter-text")
                    .setTitle(t('menu.eagleAnnotation', { 
                        annotation: annotation.length > 14 ? annotation.substring(0, 14) + "..." : annotation 
                    }))
                    .onClick(() => {
                        navigator.clipboard.writeText(annotation);
                        new Notice(t('menu.copyToClipboardSuccess'));
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("link-2")
                    .setTitle(t('menu.eagleUrl', { url }))
                    .onClick(() => {
                        copyEagleUrl();
                    })
            );

            subMenu.addItem((subItem) =>
                subItem
                    .setIcon("tags")
                    .setTitle(t('menu.eagleTags', { tags: tagsArray.join(', ') }))
                    .onClick(() => {
                        const tagsString = tagsArray.join(', ');
                        navigator.clipboard.writeText(tagsString)
                            .then(() => new Notice(t('menu.copyToClipboardSuccess')))
                            .catch(err => new Notice(t('menu.copyTagsFailed')));
                    })
            );

            if (isSourceMode) {
                subMenu.addItem((subItem) =>
                    subItem
                        .setIcon("trash-2")
                        .setTitle(t('menu.clearMarkdownLink'))
                        .onClick(() => {
                            try {
                                const target = getMouseEventTarget(event);
                                const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                                const editorView = (editor as any).cm as EditorView;
                                const target_pos = editorView.posAtDOM(target);
                                deleteCurTargetLink(oburl, plugin, target_pos);
                            } catch {
                                new Notice(t('menu.clearFileError'));
                            }
                        })
                );
            }
        });

        menu.addItem((item: MenuItem) => {
            const defaultAction = () => {
                // 1. 提前获取 editor 和计算位置
                let saved_target_pos: number = -1;
                const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                
                try {
                    if (editor) {
                        const target = getMouseEventTarget(event);
                        const editorView = (editor as any).cm as EditorView;
                        // 只有当 target 在 editorView 的 DOM 里时，posAtDOM 才有效
                        if (editorView.dom.contains(target)) {
                             saved_target_pos = editorView.posAtDOM(target);
                             print('DEBUG: Calculated target_pos before modal:', saved_target_pos);
                        } else {
                             print('DEBUG: Target is not in editor DOM (Reading View?)');
                             // 尝试直接使用光标位置（如果是编辑模式）
                             // 或者如果不依赖 DOM，也许可以尝试其他方式，但暂时先这样
                        }
                    }
                } catch (e) {
                    print('DEBUG: Error calculating pos before modal:', e);
                }

                new ModifyPropertiesModal(
                    plugin.app,
                    plugin,
                    id,
                    name,
                    annotation,
                    url,
                    tagsArray,
                    (newId, newName, newAnnotation, newUrl, newTags) => {
                        try {
                            print('DEBUG: ModifyPropertiesModal callback triggered');
                            // 2. 使用提前计算的位置
                            if (saved_target_pos !== -1) {
                                print('DEBUG: Updating link with saved pos:', saved_target_pos);
                                updateCurTargetLinkTitle(oburl, plugin, saved_target_pos, newName, ext);
                            } else {
                                print('DEBUG: No saved pos, trying to recalculate...');
                                const target = getMouseEventTarget(event);
                                const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                                if (!editor) {
                                    print('DEBUG: No editor found in callback');
                                    return;
                                }
                                const editorView = (editor as any).cm as EditorView;
                                
                                try {
                                    const current_pos = editorView.posAtDOM(target);
                                    print('DEBUG: Recalculated pos in callback:', current_pos);
                                    updateCurTargetLinkTitle(oburl, plugin, current_pos, newName, ext);
                                } catch (e) {
                                    print('DEBUG: Failed to recalculate pos:', e);
                                    new Notice(t('menu.cannotFindLink'));
                                }
                            }
                        } catch (e) {
                            print('DEBUG: Error in ModifyPropertiesModal callback:', e);
                            new Notice('更新链接名称失败，请查看控制台日志');
                        }
                    }
                ).open();
            };
            item
                .setIcon("pencil")
                .setTitle(t('menu.modifyProperties'))
                .onClick(defaultAction);

            if (topLevelActions) {
                topLevelActions.push(defaultAction);
            }
        });

        menu.addItem((item: MenuItem) => {
            const defaultAction = () => {
                new FolderSelectModal(plugin.app, plugin, [id], folders || []).open();
            };
            item
                .setIcon("folder")
                .setTitle(t('menu.manageFolders'))
                .onClick(defaultAction);

            if (topLevelActions) {
                topLevelActions.push(defaultAction);
            }
        });
        // 其他菜单项可以继续使用 { id, name, ext } 数据
    }

	menu.showAtPosition({ x: event.pageX, y: event.pageY });
}

export async function addEagleImageMenuSourceMode(plugin: MyPlugin, menu: Menu, url: string, event: MouseEvent, topLevelActions?: Array<() => void>) {
	await addEagleImageMenuPreviewMode(plugin, menu, url, event, true, topLevelActions);
	menu.showAtPosition({ x: event.pageX, y: event.pageY });
} 




function copyFileToClipboardCMD(filePath: string) {

	if (!existsSync(filePath)) {
        console.error(`File ${filePath} does not exist`);
        return;
    }

    const callback = (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
			new Notice(t('menu.commandError', { message: error.message }), 3000);
			console.error(`Error executing command: ${error.message}`);
			return;
        }
    };

    if (process.platform === 'darwin') {
		execSync(`open -R "${filePath}"`);
        execSync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
        execSync(`osascript -e 'tell application "System Events" to keystroke "w" using command down'`);
		execSync(`open -a "Obsidian.app"`);
    } else if (process.platform === 'linux') {
    } else if (process.platform === 'win32') {
		let safeFilePath = filePath.replace(/'/g, "''");
        exec(`powershell -command "Set-Clipboard -Path '${safeFilePath}'"`, callback);
    }
}

export async function fetchImageInfo(url: string, port: number = 41595): Promise<{ id: string, name: string, ext: string, annotation: string, tags: string[], url: string, folders: string[] } | null> {
	const match = url.match(/\/images\/(.*)\.info/);
	if (match && match[1]) {
		const requestOptions: RequestInit = {
			method: 'GET',
			redirect: 'follow' as RequestRedirect
		};

		try {
			// Use proxy port and add timestamp to prevent caching
			const response = await fetch(`http://localhost:${port}/api/item/info?id=${match[1]}&t=${Date.now()}`, requestOptions);
			const result = await response.json();

			if (result.status === "success" && result.data) {
				return result.data;
			} else {
				print('Failed to fetch item info');
			}
		} catch (error) {
			print('Error fetching item info', error);
		}
	} else {
		print('Invalid image source format');
	}
	return null;
}

export const getMouseEventTarget = (event: MouseEvent): HTMLElement => {
    event.preventDefault();
    const target = event.target as HTMLElement;
    return target;
}

export function deleteCurTargetLink(
    url: string,
    plugin: MyPlugin,
    target_pos: number,
) {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
        new Notice(t('deleteLink.noActiveView'), 3000);
        return;
    }
    const editor = activeView.editor;
    const editorView = (editor as any).cm as EditorView;
    
    // 获取目标行和文本
    const target_line = editorView.state.doc.lineAt(target_pos);
    const line_text = target_line.text;
    
    // 检查是否在表格或callout中
    const target = editorView.domAtPos(target_pos).node as HTMLElement;
    const inTable = !!target.closest('table');
    const inCallout = !!target.closest('.callout');
    
    if (!inTable && !inCallout) {
        // 普通文本中的链接
        const finds = findLinkInLine(url, line_text);
        if (finds.length === 0) {
            new Notice(t('deleteLink.notFoundInLine'), 3000);
            return;
        }
        else if (finds.length !== 1) {
            new Notice(t('deleteLink.multipleInLine'), 3000);
            return;
        }
        else {
            editor.replaceRange('', 
                {line: target_line.number-1, ch: finds[0][0]}, 
                {line: target_line.number-1, ch: finds[0][1]}
            );
            return;
        }
    }
    
    // 处理表格或callout中的链接
    const startReg: {[key: string]: RegExp} = {
        'table': /^\s*\|/,
        'callout': /^>/,
    };
    
    const mode = inTable ? 'table' : 'callout';
    let finds_lines: number[] = [];
    let finds_all: [number, number][] = [];
    
    // 向下搜索
    for (let i = target_line.number; i <= editor.lineCount(); i++) {
        const line_text = editor.getLine(i-1);
        if (!startReg[mode].test(line_text)) break;
        
        const finds = findLinkInLine(url, line_text);
        if (finds.length > 0) {
            finds_lines.push(...new Array(finds.length).fill(i));
            finds_all.push(...finds);
        }
    }
    
    // 向上搜索
    for (let i = target_line.number-1; i >= 1; i--) {
        const line_text = editor.getLine(i-1);
        if (!startReg[mode].test(line_text)) break;
        
        const finds = findLinkInLine(url, line_text);
        if (finds.length > 0) {
            finds_lines.push(...new Array(finds.length).fill(i));
            finds_all.push(...finds);
        }
    }
    
    if (finds_all.length === 0) {
        new Notice(t('deleteLink.notFoundInScope', { scope: mode }), 3000);
        return;
    }
    else if (finds_all.length !== 1) {
        new Notice(t('deleteLink.multipleInScope', { scope: mode }), 3000);
        return;
    }
    else {
        editor.replaceRange('', 
            {line: finds_lines[0]-1, ch: finds_all[0][0]}, 
            {line: finds_lines[0]-1, ch: finds_all[0][1]}
        );
    }
    
    editor.focus();
}

export function updateCurTargetLinkTitle(
    url: string,
    plugin: MyPlugin,
    target_pos: number,
    newTitle: string,
    ext: string
) {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
        print('updateCurTargetLinkTitle no activeView');
        return;
    }
    const editor = activeView.editor;
    const editorView = (editor as any).cm as EditorView;

    const target_line = editorView.state.doc.lineAt(target_pos);
    const line_text = target_line.text;

    print('updateCurTargetLinkTitle start', {
        url,
        newTitle,
        ext,
        target_pos,
        lineNumber: target_line.number,
        line_text,
    });

    const target = editorView.domAtPos(target_pos).node as HTMLElement;
    const inTable = !!target.closest('table');
    const inCallout = !!target.closest('.callout');

    const applyReplace = (lineNumber: number, start: number, end: number) => {
        const oldLine = editor.getLine(lineNumber);
        const originalLink = oldLine.slice(start, end);
        const newLink = replaceLinkTitle(originalLink, newTitle, ext);
        print('updateCurTargetLinkTitle applyReplace', {
            lineNumber,
            start,
            end,
            originalLink,
            newLink,
        });
        editor.replaceRange(
            newLink,
            { line: lineNumber, ch: start },
            { line: lineNumber, ch: end }
        );
    };

    if (!inTable && !inCallout) {
        let finds = findLinkInLine(url, line_text);
        print('updateCurTargetLinkTitle initial finds', {
            url,
            count: finds.length,
            ranges: finds,
        });
        
        if (finds.length === 0) {
            try {
                const decodedUrl = decodeURI(url);
                if (decodedUrl !== url) {
                    finds = findLinkInLine(decodedUrl, line_text);
                    print('updateCurTargetLinkTitle decoded url search', {
                        decodedUrl,
                        count: finds.length,
                        ranges: finds,
                    });
                }
            } catch (e) {
                print('updateCurTargetLinkTitle decodeURI error', e);
            }
        }

        if (finds.length === 0) {
            try {
                const encodedUrl = encodeURI(url);
                if (encodedUrl !== url) {
                    finds = findLinkInLine(encodedUrl, line_text);
                    print('updateCurTargetLinkTitle encoded url search', {
                        encodedUrl,
                        count: finds.length,
                        ranges: finds,
                    });
                }
            } catch (e) {
                print('updateCurTargetLinkTitle encodeURI error', e);
            }
        }

        if (finds.length === 1) {
             applyReplace(target_line.number - 1, finds[0][0], finds[0][1]);
        } else if (finds.length === 0) {
            print('updateCurTargetLinkTitle no match found after all tries');
            new Notice(t('menu.cannotFindLink'));
        } else {
            print('updateCurTargetLinkTitle multiple matches found', {
                count: finds.length,
                ranges: finds,
            });
            new Notice(t('deleteLink.multipleInLine'));
        }
        return;
    }

    const startReg: { [key: string]: RegExp } = {
        table: /^\s*\|/,
        callout: /^>/,
    };

    const mode = inTable ? 'table' : 'callout';
    let finds_lines: number[] = [];
    let finds_all: [number, number][] = [];

    for (let i = target_line.number; i <= editor.lineCount(); i++) {
        const lt = editor.getLine(i - 1);
        if (!startReg[mode].test(lt)) break;
        const finds = findLinkInLine(url, lt);
        if (finds.length > 0) {
            finds_lines.push(...new Array(finds.length).fill(i));
            finds_all.push(...finds);
        }
    }

    for (let i = target_line.number - 1; i >= 1; i--) {
        const lt = editor.getLine(i - 1);
        if (!startReg[mode].test(lt)) break;
        const finds = findLinkInLine(url, lt);
        if (finds.length > 0) {
            finds_lines.push(...new Array(finds.length).fill(i));
            finds_all.push(...finds);
        }
    }

    if (finds_all.length !== 1) {
        print('updateCurTargetLinkTitle table/callout match count not 1', {
            count: finds_all.length,
            lines: finds_lines,
            ranges: finds_all,
        });
        return;
    }

    const lineIndex = finds_lines[0] - 1;
    const [start, end] = finds_all[0];
    applyReplace(lineIndex, start, end);
}

function replaceLinkTitle(link: string, newTitle: string, ext: string): string {
    const match = link.match(/^(!?\[)([^\]]*)(\]\([^)]+\))/);
    if (!match) return link;

    const prefix = match[1];
    const inner = match[2];
    const suffix = match[3];

    const fullTitle = `${newTitle}.${ext}`;

    const image = prefix.startsWith('![');
    if (!image) {
        return `${prefix}${fullTitle}${suffix}`;
    }

    const parts = inner.split('|');
    const sizePart = parts.length > 1 ? '|' + parts.slice(1).join('|') : '';
    return `${prefix}${fullTitle}${sizePart}${suffix}`;
}

// 查找一行中包含特定URL的链接
function findLinkInLine(url: string, line: string): [number, number][] {
    const results: [number, number][] = [];
    
    // 匹配Markdown链接: ![alt](url) 或 [text](url)
    const regex = new RegExp(`(!?\\[[^\\]]*\\]\\(${escapeRegExp(url)}[^)]*\\))`, 'g');
    
    let match;
    while ((match = regex.exec(line)) !== null) {
        results.push([match.index, match.index + match[0].length]);
    }
    
    return results;
}

// 转义正则表达式特殊字符
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
