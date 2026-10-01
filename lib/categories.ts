export { DEFAULT_CATEGORIES } from "@/types/manga";
import { DEFAULT_CATEGORIES } from "@/types/manga";

const CATEGORIES_KEY = "mangahub_custom_categories";

export function getStoredCategories(): string[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Guarantee user's 3 required categories are present
        const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...parsed]));
        return combined;
      }
    }
  } catch (e) {
    console.error("Error reading stored categories:", e);
  }
  return DEFAULT_CATEGORIES;
}

export function saveStoredCategories(categories: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...categories]));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(combined));
  } catch (e) {
    console.error("Error saving categories:", e);
  }
}

export function addCategory(name: string): string[] {
  const current = getStoredCategories();
  const trimmed = name.trim();
  if (!trimmed || current.includes(trimmed)) return current;
  const updated = [...current, trimmed];
  saveStoredCategories(updated);
  return updated;
}

export function deleteCategory(name: string): string[] {
  const current = getStoredCategories();
  if (DEFAULT_CATEGORIES.includes(name)) return current;
  const updated = current.filter((c) => c !== name);
  if (typeof window !== "undefined") {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(updated));
  }
  return updated;
}
