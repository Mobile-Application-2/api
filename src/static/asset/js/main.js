// popup starts
document.addEventListener("DOMContentLoaded", function () {
  var openPopupBtn = document.getElementById("openPopupBtn");
  var closePopupBtn = document.getElementById("closePopupBtn");
  var popupForm = document.getElementById("popupForm");

  openPopupBtn.addEventListener("click", function () {
    popupForm.style.display = "block";
  });

  closePopupBtn.addEventListener("click", function () {
    popupForm.style.display = "none";
  });
});

// popup ends

// Submit WaitList form
const apiUrl = "https://skyboard-api.onrender.com/api";
var waitListForm = document.getElementById("waitForm");
var waitName = document.getElementById("waitName");
var waitEmail = document.getElementById("waitEmail");

waitListForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const details = {
    email: waitEmail.value,
  };

  try {
    const result = await axios.post(`${apiUrl}/waitlist`, details, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

    const data = result.data;

    alert("You have been successfully added to the Waiting List ", waitName);

    return data;
  } catch (error) {
    if (error.response.data) {
      alert("You are already on the waiting list");
    } else {
      alert("There has been an error");
    }

    console.error(error);
  } finally {
    var popupForm = document.getElementById("popupForm");
    popupForm.style.display = "none";
  }
});

// faq starts
var acc = document.getElementsByClassName("accordion");
var i;

for (i = 0; i < acc.length; i++) {
  acc[i].addEventListener("click", function () {
    this.classList.toggle("active");
    var panel = this.nextElementSibling;
    if (panel.style.maxHeight) {
      panel.style.maxHeight = null;
    } else {
      panel.style.maxHeight = panel.scrollHeight + "px";
    }
  });
}
// faq end

// account starts
document.addEventListener("DOMContentLoaded", function () {
  const userDashboardRoute = document.querySelector(".user-dashboard-route");
  const celebDashboardRoute = document.querySelector(".celeb-dashboard-route");

  userDashboardRoute.addEventListener("click", () => {
    window.location.href = "https://benny506.github.io/skyboard/#/register";
  });

  celebDashboardRoute.addEventListener("click", () => {
    window.location.href =
      "https://benny506.github.io/skyboard_celeb/#/register";
  });
});

// account ends

// tesmonials starts
let currentSlide = 0;
const imageSliderContent = document.getElementById("imageSlider-content");
const totalSlides = imageSliderContent.children.length - 1; // Adjust for the duplicate slide
let isTransitioning = false;

function moveimageSlider(direction) {
  if (isTransitioning) return;
  isTransitioning = true;

  currentSlide = (currentSlide + direction + totalSlides) % totalSlides;

  const offset = -currentSlide * 100;
  imageSliderContent.style.transition = "transform 0.5s ease-in-out";
  imageSliderContent.style.transform = `translateX(${offset}%)`;

  setTimeout(() => {
    if (currentSlide === totalSlides - 1 && direction === 1) {
      imageSliderContent.style.transition = "none";
      currentSlide = 0;
      imageSliderContent.style.transform = `translateX(0%)`;
    }
    isTransitioning = false;
  }, 500);
}

function autoSlide() {
  moveimageSlider(1);
  setTimeout(autoSlide, 6000); // Call autoSlide again after 4 seconds
}

setTimeout(autoSlide, 4000); // Initial delay of 4 seconds
