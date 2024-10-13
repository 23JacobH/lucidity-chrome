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

    // Add eBay & facebook link button next to Add to Cart button
    function addButtons(listing) {
      const addToCartContainer = listing.querySelector('.puis-atcb-add-container');
      if (addToCartContainer) {
        const titleElement = listing.querySelector('span.a-size-base-plus.a-color-base.a-text-normal');
        let productName = titleElement ? titleElement.innerText : 'product';

        const searchQuery = encodeURIComponent(productName);
        const ebayLink = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}&LH_ItemCondition=3000`;
        const fbLink = `https://www.facebook.com/marketplace/search?itemCondition=used_like_new%2Cused_good%2Cused_fair&query=${searchQuery}&exact=false`;

        // Create a new button for eBay link
        const ebayButton = document.createElement('button');
        ebayButton.className = 'a-button a-button-secondary ebay-button'; // Amazon style button
        ebayButton.style.display = 'flex';
        ebayButton.style.alignItems = 'center';
        ebayButton.style.justifyContent = 'center';

        const fbButton = document.createElement('button');
        fbButton.className = 'a-button a-button-secondary fb-button';
        fbButton.style.display = 'flex';
        fbButton.style.alignItems = 'center';
        fbButton.style.justifyContent = 'center';

        // Create img element for eBay logo
        const ebayLogo = document.createElement('img');
        ebayLogo.src = chrome.runtime.getURL('images/ebay.png'); // Load eBay logo from directory
        ebayLogo.alt = 'Search on eBay';
        ebayLogo.style.width = '30px';
        ebayLogo.style.marginLeft = '5px';
        ebayLogo.style.marginRight = '5px';

        ebayButton.appendChild(ebayLogo);
        ebayButton.onclick = function () {
          window.open(ebayLink, '_blank');
        };

        // Create img element for Facebook Marketplace logo
        const fbLogo = document.createElement('img');
        fbLogo.src = chrome.runtime.getURL('images/fb.png');
        fbLogo.alt = 'Search on Facebook Marketplace';
        fbLogo.style.height = '12px';
        fbLogo.style.marginLeft = '5px';
        fbLogo.style.marginRight = '5px';

        fbButton.appendChild(fbLogo);
        fbButton.onclick = function () {
          window.open(fbLink, '_blank');
        };

        // Create a wrapper div to ensure buttons stay side by side
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'inline-flex';
        buttonWrapper.style.gap = '0px'; // Add some space between buttons

        // Insert both the Add to Cart, eBay, and Facebook button into the wrapper
        const addToCartButton = addToCartContainer.querySelector('.a-button-primary');
        if (addToCartButton) {
          addToCartButton.style.marginRight = '0'; // Remove extra margin to fit side by side
          buttonWrapper.appendChild(addToCartButton);
        }
        buttonWrapper.appendChild(ebayButton);
        buttonWrapper.appendChild(fbButton);

        // Replace original container with the wrapper
        addToCartContainer.appendChild(buttonWrapper);
      }
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
              addButtons(listing);
            }
          }
        });
  
        await Promise.all(promises);
        index += CONCURRENT_LIMIT;
      }
    }
  
    processListings();``
  })();
  