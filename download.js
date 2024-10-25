import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import {
    app,
    BrowserWindow,
    shell,
    dialog,
} from 'electron';

export class CancelError extends Error {}

// Replaces ext-name dependency
const getMimeExtension = (mime) => {
    // Common MIME types mapping
    const mimeToExt = {
        // Images
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/tiff': 'tiff',
        'image/bmp': 'bmp',
        'image/svg+xml': 'svg',
        'image/x-icon': 'ico',
        'image/heic': 'heic',
        'image/avif': 'avif',

        // Video
        'video/mp4': 'mp4',
        'video/mpeg': 'mpeg',
        'video/quicktime': 'mov',
        'video/x-msvideo': 'avi',
        'video/x-matroska': 'mkv',
        'video/webm': 'webm',
        'video/x-flv': 'flv',
        'video/3gpp': '3gp',
        'video/3gpp2': '3g2',

        // Audio
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/webm': 'weba',
        'audio/ogg': 'oga',
        'audio/midi': 'midi',
        'audio/aac': 'aac',
        'audio/flac': 'flac',
        'audio/x-m4a': 'm4a',

        // Documents
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/rtf': 'rtf',
        'application/vnd.oasis.opendocument.text': 'odt',
        'application/vnd.oasis.opendocument.spreadsheet': 'ods',
        'application/vnd.oasis.opendocument.presentation': 'odp',

        // Text
        'text/plain': 'txt',
        'text/html': 'html',
        'text/css': 'css',
        'text/csv': 'csv',
        'text/calendar': 'ics',
        'text/markdown': 'md',
        'text/x-python': 'py',
        'text/javascript': 'js',
        'text/xml': 'xml',
        'text/yaml': 'yaml',

        // Archives
        'application/zip': 'zip',
        'application/x-rar-compressed': 'rar',
        'application/x-7z-compressed': '7z',
        'application/x-tar': 'tar',
        'application/gzip': 'gz',
        'application/x-bzip2': 'bz2',

        // Applications
        'application/json': 'json',
        'application/ld+json': 'jsonld',
        'application/x-httpd-php': 'php',
        'application/x-sh': 'sh',
        'application/x-executable': 'exe',
        'application/x-deb': 'deb',
        'application/x-apple-diskimage': 'dmg',
        'application/x-msdownload': 'exe',
        'application/vnd.android.package-archive': 'apk',

        // Fonts
        'font/ttf': 'ttf',
        'font/otf': 'otf',
        'font/woff': 'woff',
        'font/woff2': 'woff2',

        // 3D
        'model/gltf-binary': 'glb',
        'model/gltf+json': 'gltf',
        'model/stl': 'stl',
        'model/obj': 'obj',

        // Chemical and Scientific
        'chemical/x-pdb': 'pdb',
        'chemical/x-xyz': 'xyz',
        'application/x-hdf': 'hdf',

        // Database
        'application/x-sqlite3': 'sqlite',
        'application/vnd.sqlite3': 'db',

        // Vector
        'application/illustrator': 'ai',
        'application/x-photoshop': 'psd',
        'image/x-xcf': 'xcf',

        // Other
        'application/octet-stream': 'bin',
        'application/x-binary': 'bin',
        'application/xml': 'xml',
        'application/epub+zip': 'epub'
    };

    return mimeToExt[mime];
};

// Replaces unused-filename dependency
const getUnusedFilename = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return filePath;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    let counter = 1;

    while (true) {
        const newPath = path.join(dir, `${name} (${counter})${ext}`);
        if (!fs.existsSync(newPath)) {
            return newPath;
        }
        counter++;
    }
};

// Replaces pupa dependency
const formatString = (template, data) => {
    return template.replace(/{(\w+)}/g, (match, key) => {
        return data[key] ?? match;
    });
};

const getFilenameFromMime = (name, mime) => {
    const extension = getMimeExtension(mime);
    if (!extension) {
        return name;
    }
    return `${name}.${extension}`;
};

function registerListener(session, options, callback = () => {}) {
    const downloadItems = new Set();
    let receivedBytes = 0;
    let completedBytes = 0;
    let totalBytes = 0;
    const activeDownloadItems = () => downloadItems.size;
    const progressDownloadItems = () => receivedBytes / totalBytes;

    options = {
        showBadge: true,
        showProgressBar: true,
        ...options,
    };

    const listener = (event, item, webContents) => {
        downloadItems.add(item);
        totalBytes += item.getTotalBytes();

        const window_ = BrowserWindow.fromWebContents(webContents);
        if (!window_) {
            throw new Error('Failed to get window from web contents.');
        }

        if (options.directory && !path.isAbsolute(options.directory)) {
            throw new Error('The `directory` option must be an absolute path');
        }

        const directory = options.directory ?? app.getPath('downloads');

        let filePath;
        if (options.filename) {
            filePath = path.join(directory, options.filename);
        } else {
            const filename = item.getFilename();
            const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType());

            filePath = options.overwrite ? path.join(directory, name) : getUnusedFilename(path.join(directory, name));
        }

        const errorMessage = options.errorMessage ?? 'The download of {filename} was interrupted';

        if (options.saveAs) {
            item.setSaveDialogOptions({defaultPath: filePath, ...options.dialogOptions});
        } else {
            item.setSavePath(filePath);
        }

        item.on('updated', () => {
            receivedBytes = completedBytes;
            for (const item of downloadItems) {
                receivedBytes += item.getReceivedBytes();
            }

            if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
                app.badgeCount = activeDownloadItems();
            }

            if (!window_.isDestroyed() && options.showProgressBar) {
                window_.setProgressBar(progressDownloadItems());
            }

            if (typeof options.onProgress === 'function') {
                const itemTransferredBytes = item.getReceivedBytes();
                const itemTotalBytes = item.getTotalBytes();

                options.onProgress({
                    percent: itemTotalBytes ? itemTransferredBytes / itemTotalBytes : 0,
                    transferredBytes: itemTransferredBytes,
                    totalBytes: itemTotalBytes,
                });
            }

            if (typeof options.onTotalProgress === 'function') {
                options.onTotalProgress({
                    percent: progressDownloadItems(),
                    transferredBytes: receivedBytes,
                    totalBytes,
                });
            }
        });

        item.on('done', (event, state) => {
            completedBytes += item.getTotalBytes();
            downloadItems.delete(item);

            if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
                app.badgeCount = activeDownloadItems();
            }

            if (!window_.isDestroyed() && !activeDownloadItems()) {
                window_.setProgressBar(-1);
                receivedBytes = 0;
                completedBytes = 0;
                totalBytes = 0;
            }

            if (options.unregisterWhenDone) {
                session.removeListener('will-download', listener);
            }

            if (state === 'cancelled') {
                if (typeof options.onCancel === 'function') {
                    options.onCancel(item);
                }

                callback(new CancelError());
            } else if (state === 'interrupted') {
                const message = formatString(errorMessage, {filename: path.basename(filePath)});
                callback(new Error(message));
            } else if (state === 'completed') {
                const savePath = item.getSavePath();

                if (process.platform === 'darwin') {
                    app.dock.downloadFinished(savePath);
                }

                if (options.openFolderWhenDone) {
                    shell.showItemInFolder(savePath);
                }

                if (typeof options.onCompleted === 'function') {
                    options.onCompleted({
                        fileName: item.getFilename(), // Just for backwards compatibility. TODO: Remove in the next major version.
                        filename: item.getFilename(),
                        path: savePath,
                        fileSize: item.getReceivedBytes(),
                        mimeType: item.getMimeType(),
                        url: item.getURL(),
                    });
                }

                callback(null, item);
            }
        });

        if (typeof options.onStarted === 'function') {
            options.onStarted(item);
        }
    };

    session.on('will-download', listener);
}

export default function electronDl(options = {}) {
    app.on('session-created', session => {
        registerListener(session, options, (error, _) => {
            if (error && !(error instanceof CancelError)) {
                const errorTitle = options.errorTitle ?? 'Download Error';
                dialog.showErrorBox(errorTitle, error.message);
            }
        });
    });
}

export async function download(window_, url, options) {
    return new Promise((resolve, reject) => {
        options = {
            ...options,
            unregisterWhenDone: true,
        };

        registerListener(window_.webContents.session, options, (error, item) => {
            if (error) {
                reject(error);
            } else {
                resolve(item);
            }
        });

        window_.webContents.downloadURL(url);
    });
}