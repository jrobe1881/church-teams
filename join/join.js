/* /join/join.js — Join an existing church.
   Handles three states:
     1. Not signed in  → inline sign-in / sign-up form, then proceeds to join.
     2. Signed in, no membership → church slug entry + join form.
     3. Signed in, has active membership → redirect to /dashboard/.
   The standalone /join/ page AND the inline dashboard join form both use
   renderInto(root), so both stay in sync. */
(function(){
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  /* ------------------------------------------------------------------ */
  /* Auth helpers — thin wrappers around CloudAccount                    */
  /* ------------------------------------------------------------------ */
  function signIn(email, password){
    return window.CloudAccount.getSupabaseClient().auth.signInWithPassword({ email: email, password: password });
  }
  function signUp(email, password){
    return window.CloudAccount.getSupabaseClient().auth.signUp({ email: email, password: password });
  }

  /* ------------------------------------------------------------------ */
  /* Step 1 — Sign-in / Sign-up card (shown when user is not signed in)  */
  /* ------------------------------------------------------------------ */
  function renderAuthStep(root, onSignedIn){
    var qs = new URLSearchParams(location.search);
    var slug = (qs.get('slug') || '').trim().toLowerCase();

    root.innerHTML =
      /* ---- header ---- */
      '<h2 class="teams-lede" style="margin-bottom:var(--s-2)">Join your church team</h2>' +
      '<p class="teams-sub" style="margin-bottom:var(--s-6)">Sign in or create a free account, then enter your church\u2019s join code.</p>' +

      /* ---- auth card ---- */
      '<div class="teams-card" style="max-width:480px;margin-bottom:var(--s-6)">' +
        /* tab row */
        '<div id="joinAuthTabs" style="display:flex;gap:0;border-radius:var(--r-md);overflow:hidden;border:1px solid var(--border);margin-bottom:var(--s-5)">' +
          '<button type="button" id="joinTabSignIn" style="flex:1;padding:10px 0;font-family:inherit;font-size:var(--t-sm);font-weight:600;border:none;cursor:pointer;background:var(--accent);color:#fff;transition:background var(--dur-1)">Sign in</button>' +
          '<button type="button" id="joinTabSignUp" style="flex:1;padding:10px 0;font-family:inherit;font-size:var(--t-sm);font-weight:600;border:none;cursor:pointer;background:var(--surface-2);color:var(--ink-3);transition:background var(--dur-1),color var(--dur-1)">Create account</button>' +
        '</div>' +
        '<div id="joinAuthMsg"></div>' +
        '<div class="teams-field"><label for="joinAuthEmail">Email</label><input id="joinAuthEmail" type="email" autocomplete="email" placeholder="you@example.com" /></div>' +
        '<div class="teams-field"><label for="joinAuthPassword">Password</label><input id="joinAuthPassword" type="password" autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></div>' +
        '<div class="teams-field" id="joinAuthPasswordConfirmField" style="display:none"><label for="joinAuthPasswordConfirm">Confirm password</label><input id="joinAuthPasswordConfirm" type="password" autocomplete="new-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></div>' +
        '<button class="teams-btn teams-btn-block" id="joinAuthSubmit" type="button">Sign in</button>' +
      '</div>' +

      /* ---- divider ---- */
      '<hr class="teams-divider" style="margin-bottom:var(--s-5)" />' +
      '<p class="teams-sub" style="margin-bottom:var(--s-2)">Registering a new church?</p>' +
      '<a class="teams-link" href="/register/">Register here \u2192</a>';

    var tabSignIn = document.getElementById('joinTabSignIn');
    var tabSignUp = document.getElementById('joinTabSignUp');
    var confirmField = document.getElementById('joinAuthPasswordConfirmField');
    var submitBtn = document.getElementById('joinAuthSubmit');
    var msgEl = document.getElementById('joinAuthMsg');
    var emailEl = document.getElementById('joinAuthEmail');
    var passwordEl = document.getElementById('joinAuthPassword');
    var confirmEl = document.getElementById('joinAuthPasswordConfirm');

    var currentTab = 'signin';

    function switchTab(tab){
      currentTab = tab;
      if (tab === 'signin'){
        tabSignIn.style.background = 'var(--accent)'; tabSignIn.style.color = '#fff';
        tabSignUp.style.background = 'var(--surface-2)'; tabSignUp.style.color = 'var(--ink-3)';
        confirmField.style.display = 'none';
        submitBtn.textContent = 'Sign in';
        passwordEl.setAttribute('autocomplete','current-password');
      } else {
        tabSignUp.style.background = 'var(--accent)'; tabSignUp.style.color = '#fff';
        tabSignIn.style.background = 'var(--surface-2)'; tabSignIn.style.color = 'var(--ink-3)';
        confirmField.style.display = 'block';
        submitBtn.textContent = 'Create account';
        passwordEl.setAttribute('autocomplete','new-password');
      }
      msgEl.innerHTML = '';
    }

    tabSignIn.addEventListener('click', function(){ switchTab('signin'); });
    tabSignUp.addEventListener('click', function(){ switchTab('signup'); });

    /* Allow pressing Enter in any field to submit */
    [emailEl, passwordEl, confirmEl].forEach(function(el){
      el.addEventListener('keydown', function(e){ if (e.key === 'Enter') submitBtn.click(); });
    });

    submitBtn.addEventListener('click', function(){
      msgEl.innerHTML = '';
      var email = (emailEl.value || '').trim();
      var password = passwordEl.value || '';
      if (!email){ showMsg('Email is required.', 'err'); return; }
      if (!password){ showMsg('Password is required.', 'err'); return; }
      if (currentTab === 'signup'){
        if (password.length < 6){ showMsg('Password must be at least 6 characters.', 'err'); return; }
        var confirm = confirmEl.value || '';
        if (password !== confirm){ showMsg('Passwords don\u2019t match.', 'err'); return; }
      }

      submitBtn.disabled = true;
      submitBtn.textContent = currentTab === 'signin' ? 'Signing in\u2026' : 'Creating account\u2026';

      var promise = currentTab === 'signin' ? signIn(email, password) : signUp(email, password);
      promise.then(function(res){
        submitBtn.disabled = false;
        submitBtn.textContent = currentTab === 'signin' ? 'Sign in' : 'Create account';
        if (res.error){
          var msg = String(res.error.message || 'Something went wrong.');
          if (/invalid.*credentials/i.test(msg) || /invalid login/i.test(msg)){
            msg = 'Wrong email or password.';
          } else if (/already registered/i.test(msg) || /user already exists/i.test(msg)){
            msg = 'An account with that email already exists. Try signing in instead.';
          } else if (/email.*not.*confirmed/i.test(msg)){
            msg = 'Please confirm your email address first, then sign in.';
          }
          showMsg(msg, 'err');
          return;
        }
        /* Sign-up may require email confirmation */
        if (currentTab === 'signup' && res.data && res.data.user && !res.data.session){
          showMsg('Account created! Check your email for a confirmation link, then come back and sign in.', 'ok');
          switchTab('signin');
          return;
        }
        /* Signed in — proceed */
        onSignedIn();
      }).catch(function(e){
        submitBtn.disabled = false;
        submitBtn.textContent = currentTab === 'signin' ? 'Sign in' : 'Create account';
        showMsg(String(e && e.message ? e.message : 'Something went wrong.'), 'err');
      });
    });

    function showMsg(text, kind){
      msgEl.innerHTML = '<div class="teams-' + (kind === 'ok' ? 'note' : 'error') + '" style="margin-bottom:var(--s-4)">' + esc(text) + '</div>';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Step 2 — Church slug entry + join request                           */
  /* ------------------------------------------------------------------ */
  function renderJoinForm(root, user){
    var qs = new URLSearchParams(location.search);
    var prefillSlug = (qs.get('slug') || '').trim().toLowerCase();

    root.innerHTML =
      '<h2 class="teams-lede" style="margin-bottom:var(--s-2)">Join your church team</h2>' +
      '<p class="teams-sub" style="margin-bottom:var(--s-6)">Enter your church\u2019s join code to request access. Your admin will approve the request.</p>' +

      '<div class="teams-card" style="max-width:480px;margin-bottom:var(--s-6)">' +
        '<div class="teams-field">' +
          '<label for="joinSlug">Church code</label>' +
          '<input id="joinSlug" type="text" placeholder="e.g. redwood" autocomplete="off" autocapitalize="off" value="' + esc(prefillSlug) + '" />' +
          '<div class="teams-hint">Ask your church admin for the code.</div>' +
        '</div>' +
        '<div id="joinChurchInfo"></div>' +
        '<div class="teams-field" id="joinPasswordField" style="display:none">' +
          '<label for="joinPassword">Join password</label>' +
          '<input id="joinPassword" type="password" autocomplete="off" />' +
        '</div>' +
        '<div class="teams-field">' +
          '<label for="joinName">Your name</label>' +
          '<input id="joinName" type="text" placeholder="How your admin will see you" />' +
        '</div>' +
        '<div id="joinErr"></div>' +
        '<button class="teams-btn teams-btn-block" id="joinSubmitBtn" type="button">Request to join</button>' +
      '</div>' +

      '<hr class="teams-divider" style="margin-bottom:var(--s-5)" />' +
      '<p class="teams-sub" style="margin-bottom:var(--s-2)">Registering a new church?</p>' +
      '<a class="teams-link" href="/register/">Register here \u2192</a>';

    var slugInput = document.getElementById('joinSlug');
    var infoEl   = document.getElementById('joinChurchInfo');
    var pwField  = document.getElementById('joinPasswordField');
    var errEl    = document.getElementById('joinErr');
    var btn      = document.getElementById('joinSubmitBtn');
    var foundChurch = null;

    if (prefillSlug) slugInput.disabled = true;

    function lookup(){
      var slug = (slugInput.value || '').trim().toLowerCase();
      infoEl.innerHTML = ''; foundChurch = null;
      if (!slug) return;
      window.TeamsCtx.sb.rpc('bst_find_church_by_slug', { p_slug: slug }).then(function(res){
        if (res.error || !res.data){
          infoEl.innerHTML = '<div class="teams-error" style="margin-bottom:var(--s-3)">No church found with that code. Double-check with your admin.</div>';
          pwField.style.display = 'none'; return;
        }
        foundChurch = res.data;
        var chips = '';
        if (foundChurch.requires_password) chips += '<span class="teams-chip is-neutral" style="margin-right:4px">Requires password</span>';
        if (foundChurch.requires_approval) chips += '<span class="teams-chip is-neutral">Admin approval</span>';
        infoEl.innerHTML = '<div class="teams-row" style="margin-bottom:var(--s-3)">' +
          '<div><strong style="font-size:var(--t-sm)">' + esc(foundChurch.name) + '</strong>' +
          (chips ? '<div style="margin-top:6px">' + chips + '</div>' : '') + '</div></div>';
        pwField.style.display = foundChurch.requires_password ? 'block' : 'none';
      });
    }
    slugInput.addEventListener('blur', lookup);
    if (prefillSlug) lookup();

    btn.addEventListener('click', function(){
      errEl.innerHTML = '';
      var slug = (slugInput.value || '').trim().toLowerCase();
      if (!slug){ errEl.innerHTML = '<div class="teams-error">Enter your church code.</div>'; return; }
      var doJoin = function(church){
        var name = (document.getElementById('joinName').value || '').trim();
        if (!name && user && user.email) name = user.email.split('@')[0];
        var password = document.getElementById('joinPassword').value || '';
        btn.disabled = true; btn.textContent = 'Requesting\u2026';
        window.TeamsCtx.sb.rpc('bst_join_church', { p_church_id: church.church_id, p_password: password, p_full_name: name }).then(function(res){
          btn.disabled = false; btn.textContent = 'Request to join';
          if (res.error){
            var msg = String(res.error.message || '');
            if (msg.indexOf('wrong_password') !== -1){
              errEl.innerHTML = '<div class="teams-error">That password doesn\u2019t match. Ask your admin to confirm it.</div>';
            } else if (msg.indexOf('church_not_found') !== -1){
              errEl.innerHTML = '<div class="teams-error">No church with that code.</div>';
            } else {
              errEl.innerHTML = '<div class="teams-error">' + esc(msg || 'Something went wrong.') + '</div>';
            }
            return;
          }
          window.TeamsCtx.reloadMemberships().then(function(){ location.href = '/dashboard/'; });
        });
      };
      if (foundChurch && foundChurch.slug === slug){ doJoin(foundChurch); return; }
      window.TeamsCtx.sb.rpc('bst_find_church_by_slug', { p_slug: slug }).then(function(res){
        if (res.error || !res.data){
          errEl.innerHTML = '<div class="teams-error">No church with that code. Ask your admin for the correct link.</div>'; return;
        }
        foundChurch = res.data; doJoin(foundChurch);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Main entry — renderInto(root)                                        */
  /* ------------------------------------------------------------------ */
  function renderInto(root){
    var user = window.TeamsCtx ? window.TeamsCtx.user : null;

    if (!user){
      /* Show inline auth first, then proceed to the join form on success */
      renderAuthStep(root, function(){
        /* After sign-in, reload memberships so TeamsCtx is fresh */
        var CA = window.CloudAccount;
        var tryRender = function(){
          window.TeamsCtx.reloadMemberships().then(function(){
            if (window.TeamsCtx.hasTeamsAccess){
              location.href = '/dashboard/';
            } else {
              renderJoinForm(root, window.TeamsCtx.user);
            }
          });
        };
        /* CloudAccount may still be mid-auth-change; give it a tick */
        if (CA && CA.ready){
          CA.ready.then(tryRender);
        } else {
          setTimeout(tryRender, 200);
        }
      });
      return;
    }

    if (window.TeamsCtx.hasTeamsAccess){
      location.href = '/dashboard/';
      return;
    }

    renderJoinForm(root, user);
  }

  window.TeamsJoin = { renderInto: renderInto };

  var root = document.getElementById('joinRoot');
  if (root){
    window.TeamsCtx.ready.then(function(){ renderInto(root); });
  }
})();
