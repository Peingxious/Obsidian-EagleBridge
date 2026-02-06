import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import chokidar from "chokidar";
import { EventEmitter } from "events";
import { Notice } from "obsidian";
import { print, setDebug } from "./main";

let server: http.Server;
let isServerRunning = false;
let latestDirUrl: string | null = null;
let watcher: chokidar.FSWatcher | null = null;

const urlEmitter = new EventEmitter();

// Cache for metadata.json to avoid frequent disk I/O and parsing
// Key: folder path, Value: { name: string, ext: string, mtime: number }
const metadataCache = new Map<
	string,
	{ name: string; ext: string; mtime: number }
>();

// let exportedData: { imageName?: string; annotation?: string } = {};

function getContentType(ext: string): string | null {
	switch (ext) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".bmp":
			return "image/bmp";
		case ".tif":
		case ".tiff":
			return "image/tiff";
		case ".svg":
			return "image/svg+xml";
		case ".pdf":
			return "application/pdf";
		case ".mp4":
			return "video/mp4";
		case ".mp3":
			return "audio/mpeg";
		case ".ogg":
			return "audio/ogg";
		case ".wav":
			return "audio/wav";
		case ".json":
			return "application/json";
		case ".xml":
			return "application/xml";
		case ".ico":
			return "image/x-icon";
		case ".txt":
			return "text/plain";
		case ".csv":
			return "text/csv";
		case ".html":
			return "text/html";
		case ".css":
			return "text/css";
		case ".js":
			return "application/javascript";
		// case '.pptx':
		//     return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
		// case '.url':
		// return 'text/plain';
		default:
			return null;
	}
}

export function startServer(libraryPath: string, port: number) {
	if (isServerRunning) return;

	const imagesPath = path.join(libraryPath, "images");

	// 使用 chokidar 监控 images 目录中新建的文件夹
	watcher = chokidar.watch(imagesPath, {
		ignored: /(^|[\/\\])\../, // 忽略隐藏文件
		persistent: true,
		depth: 1, // 只监控一级目录
		ignoreInitial: true, // 忽略初始添加的文件和文件夹
	});

	watcher.on("addDir", (dirPath) => {
		const relativePath = path
			.relative(libraryPath, dirPath)
			.replace(/\\/g, "/");
		latestDirUrl = `http://localhost:${port}/${relativePath}`;
		// console.log(`新建文件夹路径: ${latestDirUrl}`);
		urlEmitter.emit("urlUpdated", latestDirUrl);
	});

	server = http.createServer((req, res) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader(
			"Access-Control-Allow-Methods",
			"GET, POST, OPTIONS, PUT, PATCH, DELETE",
		);
		res.setHeader(
			"Access-Control-Allow-Headers",
			"X-Requested-With,content-type",
		);
		res.setHeader("Access-Control-Allow-Credentials", "true");

		const urlObj = new URL(req.url || "/", `http://${req.headers.host}`);
		const pathname = urlObj.pathname;

		if (pathname === "/latest") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ url: latestDirUrl }));
			return;
		}

		// 处理本插件作为 Eagle API 的代理，避免 CORS
		if (pathname.startsWith("/api/")) {
			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}
			proxyToEagle(pathname + urlObj.search, req, res);
			return;
		}

		// 使用 decodeURIComponent 解码路径，并移除可能的查询参数
		const decodedPath = decodeURIComponent(pathname);
		const filePath = path.join(libraryPath, decodedPath);

		// 解析 URL 查询参数
		const noAutoplay = urlObj.searchParams.has("noautoplay");

		// 将参数存储在请求对象中，以便后续处理时使用
		(req as any).noAutoplay = noAutoplay;

		// 新增：提前验证请求路径是否在 images 目录下
		if (!filePath.startsWith(path.join(libraryPath, "images") + path.sep)) {
			res.writeHead(404);
			res.end();
			return;
		}

		fs.stat(filePath, (err, stats) => {
			if (err) {
				// 修改：静默处理 ENOENT 错误
				if (err.code === "ENOENT") {
					res.writeHead(404).end();
				} else {
					res.writeHead(500).end("Internal Error");
				}
				return;
			}

			if (stats.isDirectory()) {
				const jsonFilePath = path.join(filePath, "metadata.json");

				fs.stat(jsonFilePath, (err, jsonStats) => {
					if (err) {
						res.writeHead(404).end();
						return;
					}

					const serveImage = (
						imageName: string,
						imageExt: string,
					) => {
						const imageFile = `${imageName}.${imageExt}`;
						const imagePath = path.join(filePath, imageFile);

						if (imageExt === "url") {
							fs.readFile(imagePath, (err, data) => {
								if (err) {
									console.error("Error reading file:", err);
									res.writeHead(404, {
										"Content-Type": "text/plain",
									});
									res.end("File not found");
								} else {
									const content = data.toString("utf8");
									const urlMatch = content.match(/URL=(.+)/i);
									if (urlMatch && urlMatch[1]) {
										res.writeHead(302, {
											Location: urlMatch[1],
										});
										res.end();
									} else {
										res.writeHead(204).end();
									}
								}
							});
							return;
						}

						// Use stream for media files to reduce memory usage
						const stream = fs.createReadStream(imagePath);

						stream.on("error", (err) => {
							console.error("Error reading file stream:", err);
							if (!res.headersSent) {
								res.writeHead(404, {
									"Content-Type": "text/plain",
								});
								res.end("File not found");
							}
						});

						stream.on("open", () => {
							const contentType = getContentType(`.${imageExt}`);
							if (contentType === null) {
								if (!res.headersSent) res.writeHead(204);
								stream.close(); // Close stream if not used
								res.end();
								return;
							}
							res.writeHead(200, { "Content-Type": contentType });
							stream.pipe(res);
						});
					};

					// Cache check
					const cached = metadataCache.get(jsonFilePath);
					if (cached && cached.mtime >= jsonStats.mtimeMs) {
						serveImage(cached.name, cached.ext);
						return;
					}

					fs.readFile(jsonFilePath, "utf8", (err, data) => {
						if (err) {
							console.error("Error reading JSON file:", err);
							res.writeHead(500, {
								"Content-Type": "text/plain",
							});
							res.end("Internal Server Error");
						} else {
							try {
								const info = JSON.parse(data);
								const imageName = info.name;
								const imageExt = info.ext;

								// Update cache
								metadataCache.set(jsonFilePath, {
									name: imageName,
									ext: imageExt,
									mtime: jsonStats.mtimeMs,
								});

								serveImage(imageName, imageExt);
							} catch (parseErr) {
								console.error("Error parsing JSON:", parseErr);
								res.writeHead(500, {
									"Content-Type": "text/plain",
								});
								res.end("Error parsing JSON");
							}
						}
					});
				});
			} else {
				// 新增：缓存验证头
				res.setHeader("Cache-Control", "public, max-age=604800"); // 1 week

				const ext = path.extname(filePath).toLowerCase();
				if (ext === ".url") {
					fs.readFile(filePath, (err, data) => {
						if (err) {
							// console.error('Error reading file:', err);
							res.writeHead(500, {
								"Content-Type": "text/plain",
							});
							res.end("Internal Server Error");
						} else {
							const content = data.toString("utf8");
							const urlMatch = content.match(/URL=(.+)/i);
							if (urlMatch && urlMatch[1]) {
								res.writeHead(302, { Location: urlMatch[1] });
								res.end();
							} else {
								res.writeHead(204).end();
							}
						}
					});
					return;
				}

				const stream = fs.createReadStream(filePath);

				stream.on("error", (err) => {
					// console.error('Error reading file:', err);
					if (!res.headersSent) {
						res.writeHead(404, { "Content-Type": "text/plain" });
						res.end("File not found");
					}
				});

				stream.on("open", () => {
					const contentType = getContentType(ext);
					if (contentType === null) {
						if (!res.headersSent) res.writeHead(204);
						stream.close();
						res.end();
						return;
					}
					res.writeHead(200, { "Content-Type": contentType });
					stream.pipe(res);
				});
			}
		});
	});

	server.on("error", (e: any) => {
		if (e.code === "EADDRINUSE") {
			const msg = `Eagle Image Organizer: Port ${port} is in use. Please change the port in settings or close the conflicting application.`;
			console.error(msg);
			new Notice(msg, 10000);
			isServerRunning = false;
		} else {
			console.error("Eagle Image Organizer Server error:", e);
		}
	});

	server.listen(port, () => {
		isServerRunning = true;
		print(`Server is running at http://localhost:${port}/`);
	});
}

function proxyToEagle(
	pathWithQuery: string,
	clientReq: http.IncomingMessage,
	clientRes: http.ServerResponse,
) {
	const options: http.RequestOptions = {
		hostname: "127.0.0.1",
		port: 41595,
		path: pathWithQuery,
		method: clientReq.method,
		headers: {
			"Content-Type":
				clientReq.headers["content-type"] || "application/json",
		},
	};

	const proxyReq = http.request(options, (proxyRes) => {
		if (proxyRes.headers["content-type"]) {
			clientRes.setHeader(
				"Content-Type",
				proxyRes.headers["content-type"] as string,
			);
		}
		clientRes.writeHead(proxyRes.statusCode || 500);
		proxyRes.pipe(clientRes);
	});

	proxyReq.on("error", (err) => {
		print(`Error proxying to Eagle: ${err}`);
		clientRes.writeHead(500);
		clientRes.end("Proxy Error");
	});

	if (clientReq.method === "GET" || clientReq.method === "HEAD") {
		proxyReq.end();
	} else {
		clientReq.on("data", (chunk) => {
			proxyReq.write(chunk);
		});
		clientReq.on("end", () => {
			proxyReq.end();
		});
	}
}

export function refreshServer(libraryPath: string, port: number) {
	if (isServerRunning) {
		stopServer();
	}
	print("Server restarting...");
	startServer(libraryPath, port);
}

export function stopServer() {
	if (watcher) {
		watcher
			.close()
			.then(() => {
				print("Watcher closed.");
			})
			.catch((err) => {
				console.error("Error closing watcher:", err);
			});
		watcher = null;
	}

	if (isServerRunning && server) {
		server.close(() => {
			isServerRunning = false;
			print("Server stopped.");
		});
	}

	// Clear metadata cache to prevent stale data when library changes
	metadataCache.clear();
}

export function getLatestDirUrl(): string | null {
	return latestDirUrl;
}

export { urlEmitter };

// export { exportedData };
