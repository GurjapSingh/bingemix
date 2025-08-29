import { cookies } from "next/headers";

export async function GET(){
    try {
        const cookieStore = await cookies();
        const cookieData = cookieStore?.get("plex_server")?.value;
        if (!cookieData) {
            return Response.json({error: "Unable to retrieve token"}, {status:404});
        }
        const server = JSON.parse(cookieData);

        const url = new URL("/library/sections", server.uri);
        url.searchParams.set("X-Plex-Token", server.accessToken);

        const res = await fetch(url,{
            headers: {Accept: "application/json"}
        });
        if (!res.ok) {
            const body = await res.text();
            return Response.json( { error: "Plex PMS error", details: body }, { status:500 } );
        }

        const data = await res.json();
        const dirs = data?.MediaContainer?.Directory ?? [];

        const tvLibraries = dirs
            .filter((dir) => dir.type === "show")
            .map((dir) => ({ key: String(dir.key), title: dir.title }));

        return Response.json(tvLibraries, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return Response.json({ error: "Error while fetching libraries"});
    }
}