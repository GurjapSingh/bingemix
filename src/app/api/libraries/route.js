import { cookies } from "next/headers";

export async function GET(){
    try {
        const cookieStore = await cookies();
        const cookieData = cookieStore?.get("plex_server")?.value;

        if (!cookieData) {
            return Response.json({error: "Unable to retrieve token"}, {status:404});
        }
        const server = JSON.parse(cookieData);
        const res = await fetch(`${server.uri}/library/sections?X-Plex-Token=${server.accessToken}`,{
            headers: {Accept: "application/json"}
        })
        const data = await res.json();
        return Response.json({Response: data});
    } catch (error) {
        return Response.json({ error: "Error while fetching libraries"});
    }
}