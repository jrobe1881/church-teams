/* /teams/join/join.js — Standalone join screen at /teams/join/ (and /teams/join/?slug=).
   Shares the same rendering logic as the inline join-first view on /teams/,
   exposed here as window.TeamsJoin.renderInto(mountEl) so both pages stay
   in sync without duplicating markup. */
(function(){
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  function renderInto(root){
    var user = window.TeamsCtx.user;
    root.innerHTML =
      (!user ? '<div class="teams-error" style="margin-bottom:var(--s-4)">Sign in first, then request to join.</div>' : '') +
      '<h2 class="teams-lede">Join your church</h2>' +
      '<p class="teams-sub">Enter your church\u2019s slug to request access. Your church admin will confirm any password or approval requirements.</p>' +
      '<div class="teams-card" style="margin-bottom:var(--s-6)">' +
        '<div class="teams-field"><label for="joinSlug">Church slug</label><input id="joinSlug" type="text" placeholder="redwood" autocomplete="off" autocapitalize="off" /></div>' +
        '<div id="joinChurchInfo"></div>' +
        '<div class="teams-field" id="joinPasswordField" style="display:none"><label for="joinPassword">Password</label><input id="joinPassword" type="password" autocomplete="off" /></div>' +
        '<div class="teams-field"><label for="joinName">Your name</label><input id="joinName" type="text" placeholder="Optional" /></div>' +
        '<div id="joinErr"></div>' +
        '<button class="teams-btn teams-btn-block" id="joinSubmitBtn" type="button">Request to join</button>' +
      '</div>' +
      '<hr class="teams-divider" />' +
      '<p class="teams-sub" style="margin-bottom:var(--s-2)">Starting a new church?</p>' +
      '<a class="teams-link" href="/teams/register/">Register here</a>';

    var slugInput = document.getElementById('joinSlug');
    var qs = new URLSearchParams(location.search);
    var prefillSlug = qs.get('slug');
    if (prefillSlug) { slugInput.value = prefillSlug; slugInput.disabled = true; }

    var infoEl = document.getElementById('joinChurchInfo');
    var pwField = document.getElementById('joinPasswordField');
    var errEl = document.getElementById('joinErr');
    var btn = document.getElementById('joinSubmitBtn');
    var foundChurch = null;

    function lookup(){
      var slug = (slugInput.value || '').trim().toLowerCase();
      infoEl.innerHTML = '';
      foundChurch = null;
      if (!slug) return;
      window.TeamsCtx.sb.rpc('bst_find_church_by_slug', { p_slug: slug }).then(function(res){
        if (res.error || !res.data) {
          infoEl.innerHTML = '<div class="teams-error">No church with that slug. Ask your church admin for the correct link.</div>';
          pwField.style.display = 'none';
          return;
        }
        foundChurch = res.data;
        var chips = '';
        chips += foundChurch.requires_password ? '<span class="teams-chip is-neutral">Requires password</span> ' : '';
        chips += foundChurch.requires_approval ? '<span class="teams-chip is-neutral">Admin approval</span>' : '';
        infoEl.innerHTML = '<div class="teams-card" style="margin:var(--s-3) 0"><strong>' + esc(foundChurch.name) + '</strong><div style="margin-top:6px">' + chips + '</div></div>';
        pwField.style.display = foundChurch.requires_password ? 'block' : 'none';
      });
    }
    slugInput.addEventListener('blur', lookup);
    if (prefillSlug) lookup();

    btn.addEventListener('click', function(){
      if (!user) { if (window.CloudAccount) window.CloudAccount.openModal('signin'); return; }
      errEl.innerHTML = '';
      var slug = (slugInput.value || '').trim().toLowerCase();
      if (!slug) { errEl.innerHTML = '<div class="teams-error">Enter a church slug.</div>'; return; }
      var doJoin = function(church){
        var name = (document.getElementById('joinName').value || '').trim();
        if (!name && user.email) name = user.email.split('@')[0];
        var password = document.getElementById('joinPassword').value || '';
        btn.disabled = true; btn.textContent = 'Requesting\u2026';
        window.TeamsCtx.sb.rpc('bst_join_church', { p_church_id: church.church_id, p_password: password, p_full_name: name }).then(function(res){
          btn.disabled = false; btn.textContent = 'Request to join';
          if (res.error) {
            var msg = String(res.error.message || '');
            if (msg.indexOf('wrong_password') !== -1) {
              errEl.innerHTML = '<div class="teams-error">That password doesn\u2019t match. Ask your admin to confirm it.</div>';
            } else if (msg.indexOf('church_not_found') !== -1) {
              errEl.innerHTML = '<div class="teams-error">No church with that slug. Ask your church admin for the correct link.</div>';
            } else {
              errEl.innerHTML = '<div class="teams-error">' + esc(msg || 'Something went wrong.') + '</div>';
            }
            return;
          }
          window.TeamsCtx.reloadMemberships().then(function(){ location.href = '/teams/'; });
        });
      };
      if (foundChurch && foundChurch.slug === slug) { doJoin(foundChurch); return; }
      window.TeamsCtx.sb.rpc('bst_find_church_by_slug', { p_slug: slug }).then(function(res){
        if (res.error || !res.data) { errEl.innerHTML = '<div class="teams-error">No church with that slug. Ask your church admin for the correct link.</div>'; return; }
        foundChurch = res.data;
        doJoin(foundChurch);
      });
    });
  }

  window.TeamsJoin = { renderInto: renderInto };

  var root = document.getElementById('joinRoot');
  if (root) {
    window.TeamsCtx.ready.then(function(){ renderInto(root); });
  }
})();
