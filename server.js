const fs = require('fs');
const http = require('http');

const port = process.env.PORT || 3000;
const folderToWatch = process.env.WATCH; // "./build"

const httpServer = http.createServer(requestListener);

let dispatchEvent = () => {};

httpServer.listen(port, () => console.info(`Server is listening at http://localhost:${port}\n`));

if (folderToWatch) {
    watchFolder(folderToWatch, (changedFiles) => {
        console.info('files changed:\n\t' + Array.from(changedFiles.values()).join('\n\t'));

        dispatchEvent('reload');
        changedFiles.clear();
    });
}

function requestListener(incomingMessage, serverResponse) {
    switch (incomingMessage.url) {
        case '/sse':
            initSSE(serverResponse);
            return;
        case '/':
            serveIndexFile(serverResponse);
            return;
        default:
            console.info(`serve: "${incomingMessage.url}"`);
            serveFile(`.${incomingMessage.url}`, serverResponse);
    }
}

async function serveIndexFile(response) {
    let fileContent = await readFile('./index.html');
    const clientReloadListener = `<body>
        <script>
            const eventSource = new EventSource('sse');
            eventSource.onmessage = function(e) {
                console.info('server-sent event: ', e.data);

                if (e.data === 'reload') {
                    eventSource.close();
                    document.location.reload();
                }
            };
            eventSource.onerror = function() {
                console.warn('server-sent event: connection lost');
                eventSource.close();
            }
        </script>
    `;

    fileContent = fileContent.toString().replace('<body>', clientReloadListener);

    response.setHeader('Content-Type', 'text/html');
    response.end(fileContent);
}

async function serveFile(filePath, response) {
    let fileContent;

    try {
        fileContent = await readFile(filePath);
        response.setHeader('Content-Type', getContentTypeByExtension(filePath.split('.').pop()));
    } catch (error) {
        console.error(`can not serve file: ${error.path}`);
    } finally {
        response.end(fileContent);
    }
}

// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
function initSSE(response) {
    console.info('initialize server-sent events');

    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');

    dispatchEvent = (event) => {
        console.info('dispatch event: ' + event);
        response.write(`data: ${event}\n\n`);
    };

    dispatchEvent('connected');
}

async function watchFolder(path, changeHandler) {
    const changedFiles = new Set();
    const delayedChangeHandler = debounce(changeHandler, 100);
    const subFolders = await getFoldersRecursive(path);

    [path, ...subFolders].forEach(folderPath => {
        fs.watch(folderPath, (eventType, filename) => {
            changedFiles.add(folderPath + '/' + filename);
            delayedChangeHandler(changedFiles);
        });
    });

    console.info(`watching folder: ${path}\n`);
}

async function getFoldersRecursive(path, folders = []) {
    let dirEntries;

    try {
        dirEntries = await readDirectory(path);
    } catch (error) {
        console.error(error);
    }

    const folderPaths = dirEntries.filter((dirEntry) => dirEntry.isDirectory())
        .map((dirEntry) => path + '/' + dirEntry.name);

    for (const folderPath of folderPaths) {
        folders.push(folderPath);
        await getFoldersRecursive(folderPath, folders);
    }

    return folders;
}

function readDirectory(path) {
    return new Promise((resolve, reject) => {
        fs.readdir(path, {withFileTypes: true}, (error, dirEntries) => {
            if (error) {
                reject(error);
            } else {
                resolve(dirEntries);
            }
        });
    });
}

function readFile(filePath, options) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, options, (error, data) => {
            if (error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function getContentTypeByExtension(fileExtension) {
    switch (fileExtension) {
        case 'css':
            return 'text/css';
        case 'html':
            return 'text/html';
        case 'js':
            return 'application/javascript';
        case 'json':
            return 'application/json';
        default:
            return 'text/plain';
    }
}

function debounce(fnc, delay = 200, immediate = false) {
    let timeoutId;

    return (...args) => {
        if (immediate && !timeoutId) {
            fnc(...args);
        }
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fnc(...args), delay);
    };
}

