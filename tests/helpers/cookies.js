// In-memory stand-in for next/headers' cookies(), shared by the route tests.
const jar = new Map();

export function resetCookies() {
    jar.clear();
}

export const headersMock = {
    cookies: async () => ({
        get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
        set: (name, value) => {
            jar.set(name, value);
        },
        delete: (name) => {
            jar.delete(name);
        },
    }),
};
