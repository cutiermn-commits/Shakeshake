export const AVATAR_EMOJI: Record<string, string> = { idli: "🍚", dosa: "🥞", vada: "🍩", chilli: "🌶️", coconut: "🥥", mango: "🥭" };
export const avatarFor = (preset: string | null | undefined) => AVATAR_EMOJI[preset ?? ""] ?? "🙂";
