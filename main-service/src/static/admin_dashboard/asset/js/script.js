// length for otp code
function moveFocus(currentDigit) {
    const currentInput = document.getElementById(`digit${currentDigit}`);
    if (currentInput.value.length === 1 && currentDigit < 5) {
        document.getElementById(`digit${currentDigit + 1}`).focus();
    }
}

// countdown for otp
document.addEventListener("DOMContentLoaded", function() {
    var countdownElement = document.getElementById('countdown');
    var request_count= document.getElementById('request_count')
    var resendLink = document.getElementById('resend-link');
    var countdown = 10;

    var interval = setInterval(function() {
        countdown--;
        countdownElement.textContent = countdown + 's';

        if (countdown <= 0) {
            clearInterval(interval);
            request_count.style.display = 'none';
            resendLink.style.display = 'inline';
        }
    }, 1000);
});

// show and hide password
document.addEventListener("DOMContentLoaded", function() {
    var passwordField = document.getElementById('password-field');
    var togglePassword = document.getElementById('toggle-password');

    togglePassword.addEventListener('click', function() {
        var type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordField.setAttribute('type', type);

        // Optionally, you can change the SVG icon or styles here to indicate the state
        // Example: toggling a class or changing the path data
    });
});

// loadingImage
document.addEventListener("DOMContentLoaded", function() {
    var loadingImage = document.getElementById('loading');
    if (loadingImage) {
        setTimeout(function() {
            window.location.href = '../index.html'; // Replace with your target URL
        }, 6000); // 5000 milliseconds = 5 seconds
    }
});



// // Dummy data for demonstration
// const data = {
//     '2023': {
//         greenValues: [15, 25, 20, 28, 18, 22, 24, 26, 20, 19, 17, 23], // Green columns data in thousands for 2023
//         purpleValues: [10, 18, 15, 22, 25, 20, 18, 21, 23, 17, 16, 19] // Purple columns data in thousands for 2023
//     },
//     '2024': {
//         greenValues: [20, 22, 19, 24, 20, 26, 30, 22, 24, 21, 19, 27], // Green columns data in thousands for 2024
//         purpleValues: [15, 20, 18, 25, 22, 24, 19, 20, 23, 21, 17, 22] // Purple columns data in thousands for 2024
//     }
// };

// const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// // Get the canvas element
// const canvas = document.getElementById('multiColumnChart');

// // Function to update the chart data based on selected year
// function updateChart() {
//     const selectedYear = document.getElementById('yearSelect').value;
//     multiColumnChart.data.datasets[0].data = data[selectedYear].greenValues;
//     multiColumnChart.data.datasets[1].data = data[selectedYear].purpleValues;
//     multiColumnChart.update();
// }

// // Create a new chart instance
// const ctx = canvas.getContext('2d');
// let multiColumnChart = new Chart(ctx, {
//     type: 'bar',
//     data: {
//         labels: months,
//         datasets: [
//             {
//                 label: 'Green',
//                 data: data['2023'].greenValues,
//                 backgroundColor: '#9FCC3B',
//                 barPercentage: 0.6, // Adjust the width of bars
//                 categoryPercentage: 0.8, // Adjust the spacing between categories
//                 barThickness: 'flex' // Make the bars thinner
//             },
//             {
//                 label: 'Purple',
//                 data: data['2023'].purpleValues,
//                 backgroundColor: '#BD3193',
//                 barPercentage: 0.6, // Adjust the width of bars
//                 categoryPercentage: 0.8, // Adjust the spacing between categories
//                 barThickness: 'flex' // Make the bars thinner
//             }
//         ]
//     },
//     options: {
//         scales: {
//             yAxes: [{
//                 ticks: {
//                     beginAtZero: true, // Start y-axis from zero
//                     stepSize: 5, // Specify the interval between ticks as 5k Naira
//                     callback: function(value) {
//                         return value + 'k'; // Add 'k' to the tick labels
//                     }
//                 },
//                 gridLines: {
//                     display: true, // Show grid lines
//                     drawBorder: false, // Do not draw the border line
//                     drawOnChartArea: true, // Draw horizontal lines on the chart area
//                     drawTicks: false, // Do not draw tick marks on the axis
//                     color: 'rgba(0, 0, 0, 0.1)' // Light gray grid lines
//                 }
//             }],
//             xAxes: [{
//                 ticks: {
//                     display: true // Show x-axis labels at the bottom
//                 },
//                 gridLines: {
//                     display: false // Hide vertical grid lines
//                 }
//             }]
//         },
//         legend: {
//             display: true,
//             position: 'bottom' // Move legend to the bottom
//         },
//         title: {
//             display: true,
//             text: 'Monthly Data in Naira (Thousands)'
//         },
//         layout: {
//             padding: {
//                 left: 0,
//                 right: 0,
//                 top: 0,
//                 bottom: 0
//             }
//         }
//     }
// });

// pop up form

