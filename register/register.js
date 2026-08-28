/* /teams/register/register.js — Create a new church. Caller becomes church_admin. */
(function(){
  var root = document.getElementById('registerRoot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  function slugify(s){
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function renderSignedOut(){
    root.innerHTML =
      '<div class="teams-empty">' +
        '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
        '<h2>Sign in first</h2>' +
        '<p>You need to sign in before registering a church.</p>' +
        '<button class="teams-btn" id="registerSignInBtn" type="button">Sign in</button>' +
      '</div>';
    document.getElementById('registerSignInBtn').addEventListener('click', function(){
      if (window.CloudAccount) window.CloudAccount.openModal('signin');
    });
  }

  function renderForm(){
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e){}

    root.innerHTML =
      '<h2 class="teams-lede">Register your church</h2>' +
      '<p class="teams-sub">You will become the church admin. Share the invite link with teachers once your church is set up.</p>' +
      '<div class="teams-card">' +
        '<div class="teams-field"><label for="regName">Church name</label><input id="regName" type="text" placeholder="Redwood Apostolic Fellowship" required /></div>' +
        '<div class="teams-field"><label for="regSlug">Slug</label><input id="regSlug" type="text" placeholder="redwood" autocapitalize="off" autocomplete="off" /><div class="teams-hint" id="regSlugPreview">bibleparlor.com/teams/join/?slug=</div></div>' +
        '<div class="teams-field"><label for="regTz">Timezone</label><select id="regTz"></select></div>' +
        '<div class="teams-field"><label for="regPassword">Join password</label><input id="regPassword" type="text" placeholder="Optional. Leave blank for an open church." autocomplete="off" /></div>' +
        '<div class="teams-checkbox-row"><input type="checkbox" id="regApproval" /><label for="regApproval">Require admin approval for new joiners</label></div>' +
        '<div id="regErr"></div>' +
        '<button class="teams-btn teams-btn-block" id="regSubmitBtn" type="button">Register church</button>' +
      '</div>';

    var tzSelect = document.getElementById('regTz');
    var zones = ['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','America/Anchorage','Pacific/Honolulu','UTC'];
    if (tz && zones.indexOf(tz) === -1) zones.unshift(tz);
    zones.forEach(function(z){
      var opt = document.createElement('option');
      opt.value = z; opt.textContent = z;
      if (z === tz) opt.selected = true;
      tzSelect.appendChild(opt);
    });

    var nameInput = document.getElementById('regName');
    var slugInput = document.getElementById('regSlug');
    var slugPreview = document.getElementById('regSlugPreview');
    var slugEdited = false;
    slugInput.addEventListener('input', function(){ slugEdited = true; updatePreview(); });
    nameInput.addEventListener('input', function(){
      if (!slugEdited) slugInput.value = slugify(nameInput.value);
      updatePreview();
    });
    function updatePreview(){
      slugPreview.textContent = 'bibleparlor.com/teams/join/?slug=' + (slugify(slugInput.value) || '');
    }

    var btn = document.getElementById('regSubmitBtn');
    var errEl = document.getElementById('regErr');
    btn.addEventListener('click', function(){
      errEl.innerHTML = '';
      var name = (nameInput.value || '').trim();
      var slug = slugify(slugInput.value);
      if (!name) { errEl.innerHTML = '<div class="teams-error">Church name is required.</div>'; return; }
      if (!slug) { errEl.innerHTML = '<div class="teams-error">Slug is required.</div>'; return; }
      var timezone = tzSelect.value;
      var password = document.getElementById('regPassword').value || '';
      var requiresApproval = document.getElementById('regApproval').checked;

      btn.disabled = true; btn.textContent = 'Registering\u2026';
      window.TeamsCtx.sb.rpc('bst_register_church', {
        p_name: name, p_timezone: timezone, p_slug: slug,
        p_password: password || null, p_requires_approval: requiresApproval
      }).then(function(res){
        btn.disabled = false; btn.textContent = 'Register church';
        if (res.error) {
          errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>';
          return;
        }
        var data = res.data || {};
        try { (window.safeLS || localStorage).setItem('teams_active_church_v1', data.church_id || ''); } catch(e){}
        try { (window.safeLS || localStorage).setItem('teams_new_church_toast', JSON.stringify({ slug: data.slug || slug, at: Date.now() })); } catch(e){}
        window.TeamsCtx.reloadMemberships().then(function(){ location.href = '/teams/'; });
      });
    });
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.user) { renderSignedOut(); return; }
    renderForm();
  });
})();
