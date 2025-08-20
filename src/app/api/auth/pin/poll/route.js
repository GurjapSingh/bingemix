import { cookies } from "next/headers";

export async function GET(req){
    const searchParams = req.nextUrl.searchParams
    const pinId = searchParams.get("pinId");
    if (!pinId) {
        return new Response("Missing pinId", { status: 400 });
    }

    const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
        method: "GET",
        headers: {
            "X-Plex-Product": "ShowMixer",
            "X-Plex-Version": "1.0",
            "X-Plex-Platform": "Web",
            "X-Plex-Client-Identifier": process.env.PLEX_CLIENT_ID,
            Accept: "application/json",
        }
    });

    if (!res.ok) {
        const body = await res.text();
        return Response.json({error: "Failed to poll Plex",details: body}, {status: 502});
    }

    const data = await res.json();

    if (data?.authToken) {
        const cookieStore = await cookies();
        cookieStore.set("plex_user_token", data.authToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });

        return Response.json({ ok: true });
    }

    return Response.json({ ok: false });
}