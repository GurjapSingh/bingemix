"use client"
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
    const [pin, setPin] = useState(null);
    const router = useRouter();

    async function handleClick(){

        try {
            const res = await fetch("/api/auth/pin/start",{
                method: "POST",
            });
            if(!res.ok) return alert("Could not get PIN");
            const data = await res.json();
            setPin(data);
            //        poll to check
            const pollResponse = await fetch(`/api/auth/pin/poll?pinId=${data.id}`);
            if (!pollResponse.ok) return alert("Poll failed");
            const pollResponseData = await pollResponse.json();

            if (pollResponseData.ok) {
                router.push("/dashboard");
            } else {
                alert(`Your PIN is ${data.code}. Go to plex.tv/link to enter it, then come back and try again.`);
            }
        } catch (err) {
            console.error(err);
            alert("something went wrong");
        }
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