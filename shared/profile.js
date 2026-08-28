/* Bible Parlor — Profile page controller
 * Loads current profile, wires up username / email / password forms.
 * Depends on window.CloudAccount (shared/account.js).
 */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  var boot = $('acctBoot');
  var page = $('acctPage');
  var gate = $('acctGate');

  function show(el){ if(el) el.style.display = ''; }
  function hide(el){ if(el) el.style.display = 'none'; }

  function setMsg(elId, cls, text){
    var m = $(elId);
    if(!m) return;
    m.className = 'acct-msg ' + (cls || '');
    m.textContent = text || '';
  }
  function clearMsg(elId){ setMsg(elId, '', ''); }

  function t(key, fallback){ return (window.BpI18n && window.BpI18n.t) ? window.BpI18n.t(key, fallback) : (fallback || key); }

  function disable(btn, on){
    if(!btn) return;
    btn.disabled = !!on;
    if(on){ btn.dataset._prev = btn.textContent; btn.textContent = t('profile.saving', 'Saving\u2026'); }
    else if(btn.dataset._prev){ btn.textContent = btn.dataset._prev; delete btn.dataset._prev; }
  }

  function bootReady(){
    if(!window.CloudAccount){
      boot.textContent = t('profile.err.module', 'Account module failed to load.');
      return;
    }
    window.CloudAccount.ready.then(function(){
      var u = window.CloudAccount.getUser();
      if(!u){
        hide(boot); hide(page); show(gate);
        var g = $('gateSignInBtn');
        if(g){
          g.addEventListener('click', function(){
            if(window.CloudAccount.openModal) window.CloudAccount.openModal('signin');
          });
        }
        window.CloudAccount.onAuthChange(function(nu){
          if(nu){ hide(gate); loadProfile(); }
        });
        return;
      }
      loadProfile();
    });
  }

  function loadProfile(){
    var sb = window.CloudAccount.getSupabaseClient();
    if(!sb){
      boot.textContent = t('profile.err.supabase', 'Failed to reach Supabase. Please refresh.');
      return;
    }
    sb.rpc('bp_get_my_profile').then(function(res){
      if(res.error){
        boot.textContent = t('profile.err.load', 'Failed to load profile: {msg}').replace('{msg}', res.error.message || 'unknown error');
        return;
      }
      var row = (res.data && res.data[0]) || {};
      var u = window.CloudAccount.getUser();
      $('unField').value = row.username || '';
      $('emField').value = row.email || (u && u.email) || '';
      hide(boot);
      show(page);
      wire();
    }, function(err){
      boot.textContent = t('profile.err.load', 'Failed to load profile: {msg}').replace('{msg}', (err && err.message) || String(err));
    });
  }

  function wire(){
    var unBtn = $('unSave');
    var unClr = $('unClear');
    var unIn  = $('unField');
    var emBtn = $('emSave');
    var pwBtn = $('pwSave');

    // -------- Username --------
    function saveUsername(val){
      var sb = window.CloudAccount.getSupabaseClient();
      if(!sb) return;
      clearMsg('unMsg');
      disable(unBtn, true);
      sb.rpc('bp_set_username', { p_username: val }).then(function(res){
        disable(unBtn, false);
        if(res.error){
          var m = res.error.message || t('profile.username.invalid');
          if(/username_taken/i.test(m)) m = t('profile.username.taken', 'That username is already taken.');
          else if(/invalid_username/i.test(m)) m = t('profile.username.invalid', 'Username must be 3\u201324 characters: letters, digits, and underscores; must start with a letter.');
          setMsg('unMsg', 'err', m);
          return;
        }
        var row = (res.data && res.data[0]) || {};
        unIn.value = row.username || '';
        setMsg('unMsg', 'ok', row.username
          ? t('profile.username.saved', 'Saved. Others will see you as "{name}".').replace('{name}', row.username)
          : t('profile.username.cleared', 'Username cleared.'));
      }, function(err){
        disable(unBtn, false);
        setMsg('unMsg', 'err', (err && err.message) || String(err));
      });
    }

    if(unBtn) unBtn.addEventListener('click', function(){
      var v = (unIn.value || '').trim();
      // Client-side sanity check mirrors the server pattern.
      if(v && !/^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(v)){
        setMsg('unMsg', 'err', t('profile.username.invalid', 'Username must be 3\u201324 characters: letters, digits, and underscores; must start with a letter.'));
        return;
      }
      saveUsername(v);
    });

    if(unClr) unClr.addEventListener('click', function(){
      unIn.value = '';
      saveUsername('');
    });

    // -------- Email --------
    if(emBtn) emBtn.addEventListener('click', function(){
      var em = ($('emField').value || '').trim();
      clearMsg('emMsg');
      if(!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){
        setMsg('emMsg', 'err', t('profile.email.invalid', 'Please enter a valid email address.'));
        return;
      }
      var u = window.CloudAccount.getUser();
      if(u && u.email && u.email.toLowerCase() === em.toLowerCase()){
        setMsg('emMsg', 'info', t('profile.email.same', 'That is already your email.'));
        return;
      }
      var sb = window.CloudAccount.getSupabaseClient();
      if(!sb) return;
      disable(emBtn, true);
      sb.auth.updateUser({ email: em }).then(function(res){
        disable(emBtn, false);
        if(res.error){
          setMsg('emMsg', 'err', res.error.message || t('profile.email.invalid'));
          return;
        }
        setMsg('emMsg', 'ok', t('profile.email.confirm', 'Check {email} for a confirmation link. Your sign-in email changes once you confirm.').replace('{email}', em));
      }, function(err){
        disable(emBtn, false);
        setMsg('emMsg', 'err', (err && err.message) || String(err));
      });
    });

    // -------- Password --------
    if(pwBtn) pwBtn.addEventListener('click', function(){
      var p1 = $('pwField').value || '';
      var p2 = $('pwField2').value || '';
      clearMsg('pwMsg');
      if(p1.length < 8){ setMsg('pwMsg','err', t('profile.password.short', 'Password must be at least 8 characters.')); return; }
      if(p1 !== p2){ setMsg('pwMsg','err', t('profile.password.mismatch', 'Passwords do not match.')); return; }
      var sb = window.CloudAccount.getSupabaseClient();
      if(!sb) return;
      disable(pwBtn, true);
      sb.auth.updateUser({ password: p1 }).then(function(res){
        disable(pwBtn, false);
        if(res.error){
          setMsg('pwMsg','err', res.error.message || t('profile.password.updated'));
          return;
        }
        $('pwField').value = '';
        $('pwField2').value = '';
        setMsg('pwMsg','ok', t('profile.password.updated', 'Password updated.'));
      }, function(err){
        disable(pwBtn, false);
        setMsg('pwMsg','err', (err && err.message) || String(err));
      });
    });

    // Enter-to-save on the username field
    if(unIn){
      unIn.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); unBtn.click(); }
      });
    }

    // -------- Delete account --------
    var delOpen    = $('delOpen');
    var delModal   = $('acctDelModal');
    var delCancel  = $('delCancel');
    var delConfirm = $('delConfirm');
    var delField   = $('delConfirmField');

    function openDelModal(){
      if(delField) delField.value = '';
      if(delConfirm) delConfirm.disabled = true;
      setMsg('delModalMsg','', '');
      if(delModal){ delModal.classList.add('open'); setTimeout(function(){ delField && delField.focus(); }, 30); }
    }
    function closeDelModal(){
      if(delModal) delModal.classList.remove('open');
    }

    if(delOpen) delOpen.addEventListener('click', openDelModal);
    if(delCancel) delCancel.addEventListener('click', closeDelModal);
    if(delModal) delModal.addEventListener('click', function(e){
      if(e.target === delModal) closeDelModal();
    });
    if(delField) delField.addEventListener('input', function(){
      delConfirm.disabled = (delField.value || '').trim().toUpperCase() !== 'DELETE';
    });

    if(delConfirm) delConfirm.addEventListener('click', function(){
      if((delField.value || '').trim().toUpperCase() !== 'DELETE') return;
      var sb = window.CloudAccount.getSupabaseClient();
      if(!sb) return;
      setMsg('delModalMsg', '', '');
      disable(delConfirm, true);
      sb.rpc('bp_delete_my_account').then(function(res){
        if(res.error){
          disable(delConfirm, false);
          var msg = res.error.message || t('common.error');
          if(/owns_bc_groups/i.test(msg)) msg = t('profile.delete.owns_bc_groups', 'You still own a Bible Connect group. Transfer ownership or delete the group before deleting your account.');
          else if(/is_site_admin/i.test(msg)) msg = t('profile.delete.is_site_admin', 'Site admins cannot delete their own account.');
          else if(/is_church_admin/i.test(msg)) msg = t('profile.delete.is_church_admin', 'You are still a church admin in a Teams church. Have the church transfer admin to someone else first.');
          else if(/owns_au_university/i.test(msg)) msg = t('profile.delete.owns_au_university', 'You created an Access University that still exists. Delete or transfer it before deleting your account.');
          setMsg('delModalMsg', 'err', msg);
          return;
        }
        // Success — sign out locally and go home.
        setMsg('delModalMsg', 'ok', t('profile.delete.success', 'Account deleted. Redirecting\u2026'));
        try { sb.auth.signOut(); } catch(_) {}
        setTimeout(function(){
          try {
            // Clear any locally cached user data.
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (k && (k.indexOf('bsh') === 0 || k.indexOf('bp_') === 0 || k.indexOf('bst_') === 0 || k.indexOf('bc_') === 0)) {
                localStorage.removeItem(k);
              }
            }
          } catch(_) {}
          window.location.href = '/';
        }, 900);
      }, function(err){
        disable(delConfirm, false);
        setMsg('delModalMsg', 'err', (err && err.message) || String(err));
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootReady);
  } else {
    bootReady();
  }
})();
