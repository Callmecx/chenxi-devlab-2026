import { defineStore } from "pinia";
import { ref, watch } from "vue";
export const useTheme = defineStore("theme", () => {
  let saved = "";
  try {
    saved = localStorage.getItem("chenxi-theme") ?? "";
  } catch {
    /* System preference remains available. */
  }
  const dark = ref(
    saved === "dark" ||
      (!saved && matchMedia("(prefers-color-scheme: dark)").matches),
  );
  watch(
    dark,
    (value) => {
      document.documentElement.dataset.theme = value ? "dark" : "light";
      try {
        localStorage.setItem("chenxi-theme", value ? "dark" : "light");
      } catch {
        /* Theme works without persistence. */
      }
    },
    { immediate: true },
  );
  return {
    dark,
    toggle: () => {
      dark.value = !dark.value;
    },
  };
});
