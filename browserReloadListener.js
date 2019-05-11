const eventSource = new EventSource('sse');
eventSource.onmessage = function(e) {
    console.info('dev-server ', e.data);

    if (e.data === 'reload') {
        eventSource.close();
        document.location.reload();
    }
};
