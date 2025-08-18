export async function GET(req){
    const searchParams = req.nextUrl.searchParams
    const pinId = searchParams.get("pinId");

    if (!pinId) {
        return new Response("Missing pinId", { status: 400 });
    }

    return Response.json({ pinId });
}