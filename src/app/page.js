"use client";

import { useRouter } from "next/navigation";

export default function WelcomePage() {
    const router = useRouter();

    return (
        <div className="flex flex-col items-center justify-center h-screen text-center">
            <h1 className="text-3xl font-bold mb-6">Welcome to Plex Mixer</h1>
            <p className="text-lg mb-8">Get started by setting up your Plex account.</p>
            <button
                onClick={() => router.push("/setup")}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
                Get Started
            </button>
        </div>
    );
}