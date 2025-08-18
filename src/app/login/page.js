"use client"

export default function loginPage() {
    function handleClick(){
        alert("clicked sign in button");

    }
    return (
        <>
            <button
                onClick={handleClick}
                className="bg-amber-50 border"
            >
                sign in with plex
            </button>
        </>
    )
}