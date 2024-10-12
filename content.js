// contentScript.js

(async function () {
    const listings = document.querySelectorAll('.s-result-item[data-asin]');
  
    // Function to fetch product details from the product page
    async function fetchProductDetails(asin) {
      const productUrl = `https://www.amazon.com/dp/${asin}`;
      try {
        const response = await fetch(productUrl);
        const pageText = await response.text();
  
        // Parse the product page HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(pageText, 'text/html');
  
        // Extract data from 'productFactsDesktopExpander'
        const productFactsElement = doc.getElementById('productFactsDesktopExpander');
        let productFactsText = '';
  
        if (productFactsElement) {
          productFactsText = productFactsElement.innerText.toLowerCase();
        } else {
          // Try alternative IDs or selectors if necessary
          const detailBullets = doc.getElementById('detailBullets_feature_div');
          if (detailBullets) {
            productFactsText = detailBullets.innerText.toLowerCase();
          }
        }
  
        return productFactsText;
      } catch (error) {
        console.error(`Failed to fetch product details for ASIN ${asin}:`, error);
        return '';
      }
    }

    // Function that cleans up product information
    function extractFabricType(productFactsText) {
      const pattern = /fabric type\s*(.*?)\s*care instructions/si;
      const match = pattern.exec(productFactsText);
      if (match) {
        return match[1].trim().replace(/[:;]+/g, ',').replace(/\bfull\b/gi, '100%');
      } else {
        return productFactsText.replace(/[:;]+/g, ',').replace(/\bfull\b/gi, '100%');
      }
    }

    // Function to determine if a product is fast fashion
    function isFastFashion(productFactsText) {
      const fabricTypes = extractFabricType(productFactsText);
      const materialPattern = /(\d+%)?\s*([a-zA-Z]+)/gi;
      const matches = fabricTypes.match(materialPattern) || [];

      const badMaterials = ["polyester", "poly", "nylon", "acrylic", "rayon", "spandex", "polyamide", "polyester", "elastane"];

      const materialsSet = new Set(matches.map(match => {
        const percentageMaterialMatch = /(\d+%)?\s*([a-zA-Z]+)/i.exec(match);
        return percentageMaterialMatch ? percentageMaterialMatch[2].toLowerCase() : null;
      }).filter(Boolean)); // Remove any null values from set of all materials

      let highPercentageBadMaterial = false;
      matches.forEach(match => {
        const percentageMaterialMatch = /(\d+%)\s*([a-zA-Z]+)/i.exec(match);
        if (percentageMaterialMatch) {
          const percentage = parseInt(percentageMaterialMatch[1]);
          const material = percentageMaterialMatch[2].toLowerCase();
          if (badMaterials.includes(material) && percentage >= 50) {
            highPercentageBadMaterial = true;
          }
        }
      });

      const allMaterialsBad =
        materialsSet.size > 0 &&
        Array.from(materialsSet).every(material => badMaterials.includes(material));

      return highPercentageBadMaterial || allMaterialsBad;
    }
  
    // Limit the number of concurrent fetches to avoid overloading
    const CONCURRENT_LIMIT = 20;
    let index = 0;
  
    async function processListings() {
      while (index < listings.length) {
        const batch = Array.from(listings).slice(index, index + CONCURRENT_LIMIT);
        const promises = batch.map(async listing => {
          const asin = listing.getAttribute('data-asin');
          if (!asin) return;
  
          // Fetch product details
          const productFactsText = await fetchProductDetails(asin);
  
          if (productFactsText) {
            // Check if the product is fast fashion
            if (isFastFashion(productFactsText)) {
              // Dim the product image
              const imageElement = listing.querySelector('img');
              if (imageElement) {
                imageElement.style.filter = 'grayscale(100%) brightness(40%) sepia(100%) hue-rotate(-50deg) saturate(600%) contrast(0.8)';
              }
            }
          }
        });
  
        await Promise.all(promises);
        index += CONCURRENT_LIMIT;
      }
    }
  
    processListings();
  })();
  