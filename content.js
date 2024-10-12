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
  
    // Function to determine if a product is fast fashion
    function isFastFashion(productFactsText) {
      const fastFashionCountries = ['china', 'bangladesh', 'india', 'honduras'];
      const fastFashionMaterials = ['polyester', 'nylon', 'acrylic'];
  
      // Check for manufacturing country
      const isFastFashionCountry = fastFashionCountries.some(country =>
        productFactsText.includes(country)
      );
  
      // Check for phrases like '95% Polyester' in the product facts text
      const materialPattern = /(\d+%)\s*(polyester|nylon|acrylic)/gi;
      const matches = productFactsText.match(materialPattern);
  
      const hasHighPercentageFastFashionMaterial = matches && matches.length > 0;
  
      // Determine if the product is fast fashion
      return hasHighPercentageFastFashionMaterial || isFastFashionCountry;
    }
  
    // Limit the number of concurrent fetches to avoid overloading
    const CONCURRENT_LIMIT = 10;
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
  