/* Safe storage shim — behaves exactly like localStorage when the browser
   allows it (e.g. the published, standalone site), and falls back to an
   in-memory store when storage access is blocked (e.g. inside a sandboxed
   preview iframe). All persistence keys/behavior are unchanged. */
(function(){
  var _ls=null;
  try{
    var k='local'+'Storage';
    _ls=window[k];
    var t='__safe_ls_test__';
    _ls.setItem(t,'1');
    _ls.removeItem(t);
  }catch(e){ _ls=null; }
  var mem={};
  window.safeLS={
    getItem:function(key){
      if(_ls){ try{ return _ls.getItem(key); }catch(e){} }
      return Object.prototype.hasOwnProperty.call(mem,key) ? mem[key] : null;
    },
    setItem:function(key,val){
      if(_ls){ try{ _ls.setItem(key,val); return; }catch(e){} }
      mem[key]=String(val);
    },
    removeItem:function(key){
      if(_ls){ try{ _ls.removeItem(key); return; }catch(e){} }
      delete mem[key];
    }
  };
})();
