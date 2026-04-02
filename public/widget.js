/**
 * CourtOps Website Widget
 * Paste before </body> on your website:
 *
 * <script>
 *   window.CourtOpsWidgetConfig = {
 *     orgSlug: 'the-jar',
 *     apiSecret: 'YOUR_WIDGET_API_SECRET',
 *     accentColor: '#ea580c',
 *     greeting: 'Text Us',
 *     subheading: 'We\'ll get back to you shortly'
 *   };
 * </script>
 * <script src="https://courtops.app/widget.js" async></script>
 */
(function() {
  'use strict';

  var config = window.CourtOpsWidgetConfig || {};
  var orgSlug = config.orgSlug;
  var apiSecret = config.apiSecret;
  var accentColor = config.accentColor || '#ea580c';
  var greeting = config.greeting || 'Contact Us';
  var subheading = config.subheading || "We'll get back to you shortly";
  var apiBase = config.apiBase || 'https://courtops.app';

  if (!orgSlug || !apiSecret) {
    console.warn('CourtOps Widget: Missing orgSlug or apiSecret in CourtOpsWidgetConfig');
    return;
  }

  // Inject styles
  var style = document.createElement('style');
  style.textContent = [
    '.co-widget-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;justify-content:center;transition:transform 0.2s}',
    '.co-widget-btn:hover{transform:scale(1.1)}',
    '.co-widget-btn svg{width:24px;height:24px;fill:white}',
    '.co-widget-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:calc(100vw - 40px);background:#1a1a2e;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:99999;overflow:hidden;opacity:0;transform:translateY(10px);transition:all 0.2s;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '.co-widget-panel.open{opacity:1;transform:translateY(0);pointer-events:auto}',
    '.co-widget-header{padding:20px;color:white}',
    '.co-widget-header h3{margin:0;font-size:18px;font-weight:700}',
    '.co-widget-header p{margin:4px 0 0;font-size:13px;opacity:0.7}',
    '.co-widget-form{padding:0 20px 20px}',
    '.co-widget-form input,.co-widget-form textarea{width:100%;padding:10px 12px;margin-bottom:10px;background:#16213e;border:1px solid #2a2a4a;border-radius:8px;color:white;font-size:14px;outline:none;box-sizing:border-box;font-family:inherit}',
    '.co-widget-form input::placeholder,.co-widget-form textarea::placeholder{color:#666}',
    '.co-widget-form input:focus,.co-widget-form textarea:focus{border-color:' + accentColor + '}',
    '.co-widget-form textarea{resize:none;height:70px}',
    '.co-widget-form button{width:100%;padding:12px;border:none;border-radius:8px;color:white;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.2s;font-family:inherit}',
    '.co-widget-form button:disabled{opacity:0.6;cursor:not-allowed}',
    '.co-widget-success{padding:30px 20px;text-align:center;color:white}',
    '.co-widget-success svg{width:48px;height:48px;margin:0 auto 12px;fill:#22c55e}',
    '.co-widget-success h4{margin:0;font-size:16px}',
    '.co-widget-success p{margin:8px 0 0;font-size:13px;opacity:0.7}',
  ].join('\n');
  document.head.appendChild(style);

  // Create button
  var btn = document.createElement('button');
  btn.className = 'co-widget-btn';
  btn.style.backgroundColor = accentColor;
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>';
  btn.setAttribute('aria-label', 'Open contact form');

  // Create panel
  var panel = document.createElement('div');
  panel.className = 'co-widget-panel';
  panel.innerHTML = [
    '<div class="co-widget-header" style="background:' + accentColor + '">',
    '  <h3>' + greeting + '</h3>',
    '  <p>' + subheading + '</p>',
    '</div>',
    '<div class="co-widget-form">',
    '  <input type="text" name="name" placeholder="Your name" required>',
    '  <input type="tel" name="phone" placeholder="Phone number" required>',
    '  <textarea name="message" placeholder="How can we help?"></textarea>',
    '  <button type="button" style="background:' + accentColor + '">Send</button>',
    '</div>',
  ].join('\n');

  var isOpen = false;

  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
  });

  var submitBtn = panel.querySelector('button');
  submitBtn.addEventListener('click', function() {
    var name = panel.querySelector('input[name="name"]').value.trim();
    var phone = panel.querySelector('input[name="phone"]').value.trim();
    var message = panel.querySelector('textarea[name="message"]').value.trim();

    if (!name || !phone) {
      panel.querySelector('input[name="name"]').style.borderColor = name ? '' : '#ef4444';
      panel.querySelector('input[name="phone"]').style.borderColor = phone ? '' : '#ef4444';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    fetch(apiBase + '/api/widget/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-widget-secret': apiSecret,
      },
      body: JSON.stringify({ name: name, phone: phone, message: message, org_slug: orgSlug }),
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Failed');
      // Show success
      panel.innerHTML = [
        '<div class="co-widget-success">',
        '  <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
        '  <h4>Message sent!</h4>',
        '  <p>We\'ll get back to you soon.</p>',
        '</div>',
      ].join('\n');

      setTimeout(function() {
        isOpen = false;
        panel.classList.remove('open');
      }, 3000);
    })
    .catch(function() {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Try Again';
      submitBtn.style.backgroundColor = '#ef4444';
    });
  });

  document.body.appendChild(btn);
  document.body.appendChild(panel);
})();
