/**
 * Streams progress events to the browser as newline-delimited JSON.
 * `run(send)` calls send({ stage, done?, total?, ... }); a thrown error is
 * delivered as a final { stage: 'error', error } event.
 */
export function ndjson(run) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event) =>
                controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            try {
                await run(send);
            } catch (err) {
                console.error('streamed request failed:', err);
                send({ stage: 'error', error: err?.message || 'Server error' });
            } finally {
                controller.close();
            }
        },
    });
    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}
