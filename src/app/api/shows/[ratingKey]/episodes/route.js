import { cookies } from "next/headers";

export async function GET(req, { params }) {
    const { ratingKey } = await params;
    try {
        const cookieStore = await cookies();
        const serverRaw = cookieStore.get("plex_server")?.value;
        const libRaw = cookieStore.get("plex_library")?.value;

        if (!serverRaw || !libRaw) {
            return Response.json({error: "Missing server or library"}, {status: 401});
        }

        const server = JSON.parse(serverRaw);

        const url = new URL(`/library/metadata/${ratingKey}/allLeaves`, server.uri);
        // url.searchParams.set("type", "4");
        url.searchParams.set("X-Plex-Token", server.accessToken);

        const res = await fetch(url,{
            headers: {Accept: "application/json", cache: "no-store"}
        });
        if (!res.ok) {
            const body = await res.text();
            return Response.json( {error: "Episodes search failed", details: body}, {status: 502});

        }

        const data = await res.json();
        const items = data?.MediaContainer?.Metadata ?? [];
        const results = items.map((item) => ({
            ratingKey: item.ratingKey,
            season: item.parentIndex,
            episode: item.episode,
            title: item.title,
        }))

        return Response.json({results: results});

    } catch (err) {
        console.error("search route error", err);
        return Response.json({ error: "Server error" }, {status: 500 });

    }
}