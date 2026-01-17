import MyPlugin from './main';
import { syncTags } from "./synchronizedpagetabs";
import { jumpModal, openInsertImageFromEagleModal } from "./eaglejumpobsidian";

export const addCommandSynchronizedPageTabs = (myPlugin: MyPlugin) => {
	myPlugin.addCommand({
		id: "synchronized-page-tabs",
		name: "Synchronized Page Tabs",
		callback: async () => {
			syncTags(myPlugin.app, myPlugin.settings);
		},
	});
};

export const addCommandEagleJump = (myPlugin: MyPlugin) => {
	myPlugin.addCommand({
		id: "eagle-jump-obsidian",
		name: "Eagle Jump Obsidian",
		callback: async () => {
			jumpModal(myPlugin.app, myPlugin.settings);
		},
	});
};

export const addCommandInsertImageFromEagle = (myPlugin: MyPlugin) => {
	myPlugin.addCommand({
		id: "insert-image-from-eagle",
		name: "Insert Image From Eagle",
		callback: async () => {
			openInsertImageFromEagleModal(myPlugin);
		},
	});
};
