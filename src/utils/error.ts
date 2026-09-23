export const codedError = (message: string, code: string) =>
    Object.assign(new Error(message), { code });
