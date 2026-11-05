/**
 * Calls an API route that streams progress events (see lib/stream.js).
 * Invokes onEvent for each one and resolves with the final event.
 * Throws if the request or the stream reports an error.
 */
export async function runWithProgress(url, options, onEvent) {
    const res = await fetch(url, options);
    if (!res.ok || !res.body) {
        let message = 'Request failed';
        try {
            message = (await res.json()).error || message;
        } catch {}
        throw new Error(message);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let last = null;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.stage === 'error') throw new Error(event.error);
            last = event;
            onEvent?.(event);
        }
    }
    if (!last || last.stage !== 'done') {
        throw new Error('The request ended before it finished');
    }
    return last;
}
