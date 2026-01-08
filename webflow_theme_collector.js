/**
 * Theme Collector 1.2.1 - Fixed Stylesheet Detection
 * Released under the MIT License
 * Released on: January 02, 2026
 */
function getColorThemes() {
  const STORAGE_KEYS = {
    THEMES: "colorThemes_data",
    PUBLISH_DATE: "colorThemes_publishDate",
  };
  
  function getPublishDate() {
    const htmlComment = document.documentElement.previousSibling;
    return htmlComment?.nodeType === Node.COMMENT_NODE
      ? new Date(
          htmlComment.textContent.match(/Last Published: (.+?) GMT/)?.[1]
        ).getTime()
      : null;
  }

  function loadFromStorage() {
    try {
      const storedPublishDate = localStorage.getItem(STORAGE_KEYS.PUBLISH_DATE),
        currentPublishDate = getPublishDate();
      if (
        !currentPublishDate ||
        !storedPublishDate ||
        storedPublishDate !== currentPublishDate.toString()
      )
        return null;
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.THEMES));
    } catch (error) {
      console.warn("Failed to load from localStorage:", error);
      return null;
    }
  }

  function saveToStorage(themes) {
    try {
      const publishDate = getPublishDate();
      if (publishDate) {
        localStorage.setItem(STORAGE_KEYS.PUBLISH_DATE, publishDate.toString());
        localStorage.setItem(STORAGE_KEYS.THEMES, JSON.stringify(themes));
      }
    } catch (error) {
      console.warn("Failed to save to localStorage:", error);
    }
  }

  window.colorThemes = {
    themes: {},
    getTheme(themeName = "", brandName = "") {
      if (!themeName)
        return this.getTheme(Object.keys(this.themes)[0], brandName);
      const theme = this.themes[themeName];
      if (!theme) return {};
      if (!theme.brands || Object.keys(theme.brands).length === 0) return theme;
      if (!brandName) return theme.brands[Object.keys(theme.brands)[0]];
      return theme.brands[brandName] || {};
    },
  };

  const cachedThemes = loadFromStorage();
  if (cachedThemes) {
    window.colorThemes.themes = cachedThemes;
    document.dispatchEvent(new CustomEvent("colorThemesReady"));
    return;
  }

  // Get ALL stylesheet links, not just the first one
  const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  
  if (stylesheetLinks.length === 0) {
    console.error("No stylesheet links found");
    return null;
  }

  console.log(`Found ${stylesheetLinks.length} stylesheet(s), searching for themes...`);

  const themeVariables = new Set(),
    themeClasses = new Set(),
    brandClasses = new Set();

  // Fetch all stylesheets and combine their content
  Promise.all(
    stylesheetLinks.map(link => 
      fetch(link.href)
        .then(response => {
          if (!response.ok) {
            console.warn(`Failed to fetch stylesheet: ${link.href}`);
            return "";
          }
          return response.text();
        })
        .catch(error => {
          console.warn(`Error fetching ${link.href}:`, error);
          return "";
        })
    )
  )
    .then((cssTexts) => {
      // Combine all CSS text
      const combinedCSS = cssTexts.join("\n");
      
      // Fixed regex to match Webflow's variable naming convention
      // Matches: --_theme---variable-name or --_theme---group--variable-name
      (combinedCSS.match(/--_theme---[\w-]+(?:--[\w-]+)?/g) || []).forEach((variable) => {
        themeVariables.add(variable.trim());
      });
      
      // Also capture brand variables if they exist
      (combinedCSS.match(/--_brand---[\w-]+(?:--[\w-]+)?/g) || []).forEach((variable) => {
        themeVariables.add(variable.trim());
      });
      
      console.log("Found theme variables:", Array.from(themeVariables));

      // Find theme and brand classes
      (combinedCSS.match(/\.u-(theme|brand)-[\w-]+/g) || []).forEach(
        (className) => {
          if (className.startsWith(".u-theme-")) themeClasses.add(className);
          if (className.startsWith(".u-brand-")) brandClasses.add(className);
        }
      );

      console.log("Found theme classes:", Array.from(themeClasses));
      console.log("Found brand classes:", Array.from(brandClasses));

      if (themeClasses.size === 0) {
        console.warn("No theme classes found matching pattern .u-theme-*");
        console.log("Searching for any classes with 'theme' in the name...");
        const anyThemeClasses = combinedCSS.match(/\.[a-z0-9_-]*theme[a-z0-9_-]*/gi);
        console.log("Found classes with 'theme':", anyThemeClasses?.slice(0, 10));
      }

      if (themeVariables.size === 0) {
        console.warn("No theme variables found. Make sure your Webflow variables are in a collection named 'Theme' or 'Brand'");
        console.log("Searching for any CSS variables...");
        const anyVars = combinedCSS.match(/--[a-z0-9_-]+/gi);
        console.log("Found some CSS variables:", anyVars?.slice(0, 10));
        return;
      }

      const themeVariablesArray = Array.from(themeVariables);
      
      function checkClass(themeClass, brandClass = null) {
        let documentClasses = document.documentElement.getAttribute("class");
        document.documentElement.setAttribute("class", "");
        if (brandClass) {
          document.documentElement.classList.add(themeClass, brandClass);
        } else {
          document.documentElement.classList.add(themeClass);
        }
        
        const styleObject = {};
        themeVariablesArray.forEach(
          (variable) => {
            const value = getComputedStyle(document.documentElement).getPropertyValue(variable);
            if (value && value.trim()) {
              styleObject[variable] = value.trim();
            }
          }
        );
        
        document.documentElement.setAttribute("class", documentClasses || "");
        return styleObject;
      }

      themeClasses.forEach((themeClassWithDot) => {
        const themeName = themeClassWithDot
          .replace(".", "")
          .replace("u-theme-", "");
        window.colorThemes.themes[themeName] = { brands: {} };
        
        if (brandClasses.size > 0) {
          brandClasses.forEach((brandClassWithDot) => {
            const brandName = brandClassWithDot
              .replace(".", "")
              .replace("u-brand-", "");
            window.colorThemes.themes[themeName].brands[brandName] = checkClass(
              themeClassWithDot.replace(".", ""),
              brandClassWithDot.replace(".", "")
            );
          });
        } else {
          window.colorThemes.themes[themeName] = checkClass(
            themeClassWithDot.replace(".", "")
          );
        }
      });

      console.log("Collected themes:", window.colorThemes.themes);
      saveToStorage(window.colorThemes.themes);
      document.dispatchEvent(new CustomEvent("colorThemesReady"));
    })
    .catch((error) => {
      console.error("Error loading themes:", error.message);
      console.error("Full error:", error);
    });
}

window.addEventListener("DOMContentLoaded", (event) => {
  getColorThemes();
});

document.addEventListener("colorThemesReady", () => {
  $("[data-animate-theme-to]").each(function () {
    let theme = $(this).attr("data-animate-theme-to");

    ScrollTrigger.create({
      trigger: $(this),
      start: "top 10%",
      end: "bottom 10%",
      onToggle: ({ self, isActive }) => {
        if (isActive) gsap.to(".navbar_component-wrapper", { ...colorThemes.getTheme(theme) });
      }
    });
  });
});