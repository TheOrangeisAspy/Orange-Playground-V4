// games.js
async function loadCards() {
  try {
    const response = await fetch("./assets/json/games.json");
    const data = await response.json();

    const container = document.querySelector(".square-grid");
    container.innerHTML = "";

    data.cards.forEach(card => {
      const cardDiv = document.createElement("div");
      cardDiv.className = "square-card";

      const img = document.createElement("img");
      img.src = card.image;
      img.alt = card.title;
      img.className = "square-image";

      const title = document.createElement("h3");
      title.textContent = card.title;

      const embedUrl = card.url || card.embedUrl;
      let href = card.link;

      if (card.hasOwnProperty("proxy") && embedUrl) {
        const page = card.proxy ? "/assessments/blooket-sg.html" : "/worksheets/quizlet-hw.html";
        href = `${page}?title=${encodeURIComponent(card.title)}&url=${encodeURIComponent(embedUrl)}`;
      }

      if (href) {
        cardDiv.addEventListener("click", () => {
          window.location.href = href;
        });
        cardDiv.style.cursor = "pointer";
      }

      cardDiv.appendChild(img);
      cardDiv.appendChild(title);
      container.appendChild(cardDiv);
    });
  } catch (error) {
    console.error("Error loading cards:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadCards);