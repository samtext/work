document.addEventListener('DOMContentLoaded', () => {

  if (window.location.pathname === '/') {
    console.log("Payment script initialized");
    const form = document.getElementById('form');
    const submitBtn = document.getElementById('submit-btn');
    const processingOverlay = document.getElementById("processing");
    const countdownEl = document.getElementById("pay-count");

    form.addEventListener('submit', (e) => {
      // Show processing overlay
      if (processingOverlay) {
        processingOverlay.style.display = "flex";
        document.body.classList.add('is-processing');
      }

      // Disable button to prevent multiple submissions
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Processing...';
      }

      // Start countdown timer
      if (countdownEl) {
        let count = 60;
        const timer = setInterval(() => {
          count--;
          countdownEl.textContent = count;
          if (count <= 0) {
            clearInterval(timer);
          }
        }, 1000);
      }
    });
  }

  const failedSection = document.getElementById('failed');
  const successSection = document.getElementById('successful');

  // Handle redirection for failed status (Leaving as it was: 10s, pathname)
  if (failedSection || successSection) {
    const countEl = document.getElementById('count');
    const progressBar = document.getElementById('progress-bar');

    if (countEl) {
      let left = 10;
      const interval = setInterval(() => {
        left--;
        countEl.textContent = left;
        if (progressBar) {
          progressBar.style.width = (left * 10) + '%';
        }
        if (left <= 0) {
          clearInterval(interval);
        }
      }, 1000);
    }

    setTimeout(() => {
      if (failedSection) {
        window.location.pathname = "/";
      } else if (successSection) {
        window.location.pathname = "/dashboard";
      }
    }, 10000);
  }
});
