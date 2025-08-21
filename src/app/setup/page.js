"use client"

export default function loginPage() {
    async function handleClick(){
        const res = await fetch("/api/auth/pin/start",{
            method: "POST",
        })

        const data = await res.json();
        alert(JSON.stringify(data));

    }
    return (
        <>
            <div className="flex flex-col items-center justify-center h-screen text-center">
                <button
                    onClick={handleClick}
                    className="p-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition"
                >
                    Sign in with Plex
                </button>
            </div>
        </>
    )
}