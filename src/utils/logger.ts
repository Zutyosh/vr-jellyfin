function stamp(): string {
    return new Date().toISOString();
}

export const log = {
    info(msg: string, ...args: unknown[]) {
        console.log(`[${stamp()}] [INFO] ${msg}`, ...args);
    },
    warn(msg: string, ...args: unknown[]) {
        console.warn(`[${stamp()}] [WARN] ${msg}`, ...args);
    },
    error(msg: string, ...args: unknown[]) {
        console.error(`[${stamp()}] [ERROR] ${msg}`, ...args);
    },
};
