/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; -*-*/
 /* vim: set sw=2 ts=2 et tw=100:*/
(function(Zaphod) {
  Zaphod.init = function() {
    var appcontent = document.getElementById("appcontent");
    if(appcontent) {
      appcontent.addEventListener("DOMContentLoaded", Zaphod.onPageLoad, true);
    }

    // Initialize mozJSPref so that it can be used to disable SpiderMonkey
    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var prefSrv = this.prefService = Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefService).QueryInterface(Ci.nsIPrefBranch);
    var PBI = Ci.nsIPrefBranch2;
    Zaphod.mozJSPref = prefSrv.getBranch("javascript.").QueryInterface(PBI);

    // Get icon
    Zaphod.statusImage = document.getElementById("narcissus-logo");

    // Initialize engine and icons
    if (Zaphod.isActive()) {
      setNarcissusAsEngine();
    }
    else {
      setSpidermonkeyAsEngine();
    }
  }

  // Reset spidermonkey as the JS engine on shutdown.
  Zaphod.shutdown = function() {
    if (Zaphod.options.resetOnShutdown) { setSpidermonkeyAsEngine(); }
  }

  // Listener for uninstallation of this plugin
  Zaphod.uninstallationListener = {
    onUninstalling: function(addon) {
      if (addon.id == "zaphod@mozilla.com") {
        // Reset spidermonkey as the JS engine.
        setSpidermonkeyAsEngine(true);
      }
    }
  };

  // Set Narcissus to be used as the JS engine
  function setNarcissusAsEngine(verbose) {
    Zaphod.statusImage.src = "chrome://zaphod/content/mozilla_activated.ico";
    Zaphod.statusImage.tooltipText = "JS engine = Narcissus";
    Zaphod.mozJSPref.setBoolPref("enabled", false);
    if (verbose) { alert("Narcissus has been set as your JavaScript engine"); }
  }

  // Set Spidermonkey to be used as the JS engine
  function setSpidermonkeyAsEngine(verbose) {
    Zaphod.statusImage.src = "chrome://zaphod/content/mozilla_deactivated.ico";
    Zaphod.statusImage.tooltipText = "JS engine = SpiderMonkey";
    Zaphod.mozJSPref.setBoolPref("enabled", true);
    if (verbose) { alert("SpiderMonkey has been reset as your JavaScript engine"); }
  }

  // Assumes that Narcissus is the JS engine if javascript is disabled.
  Zaphod.isActive = function() {
    return !Zaphod.mozJSPref.getBoolPref("enabled");
  }

  // Switch between narcissus and spidermonkey as the JS engine
  Zaphod.toggleJSEngine = function() {
    if (Zaphod.isActive()) {
      setSpidermonkeyAsEngine(true);
    }
    else {
      setNarcissusAsEngine(true);
    }

  }

  Zaphod.log = function(msg) {
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
          .getService(Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage("Zaphod: " + msg);
  }


  // Parse a JS url and return a string of the body
  function snarf(url) {
    var lastInd = content.location.href.lastIndexOf('/');
    var baseUrl = (lastInd > 0) ?
        content.location.href.substring(0,lastInd) :
        content.location.href;

    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var xhrClass = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"];

    var req = xhrClass.createInstance(Ci.nsIXMLHttpRequest);
    // TODO: need a better way to determine if the JS url is relative.
    if (url.indexOf('://') === -1) {
      url = baseUrl + '/' + url;
    }
    req.open('GET', url, false);
    req.send(null);
    if (req.status !== 200) {
      throw new Error("Error loading " + url);
    }
    return req.responseText;
  }

  // Call Narcissus interpreter
  function evaluate(code, source, lineNum) {
    Narcissus.interpreter.evaluate(code, source, lineNum);
  }

  // Load and execute the specified JS url
  function loadExternalScript(url) {
    Zaphod.log('Running script from ' + url);
    Narcissus.interpreter.evaluate(snarf(url), url, 1);
  }

   // Run a JS command through Narcissus
  Zaphod.runSnippet = function() {
    if (!this.Narcissus) { loadNarcissus(); }
    var code = prompt("Please enter some Narcissus JavaScript code");
    try {
      evaluate(code);
    }
    catch(e) {
      alert("Error evaluating code: " + e);
    }
  }

  // Run the src attribute and the body of the specified script node
  function runScript(script) {
    let src = script.getAttribute('src');
    try {
      if (src) {
        loadExternalScript(src);
      }
      if (script['firstChild']) {
        evaluate(script['firstChild'].data);
      }
    }
    catch (e) {
      Components.utils.reportError(e);
    }
  }

  // Run only scripts where the type specifies narcissus
  function runNarcissusScripts() {
    var narcLoaded = false;
    var scripts = content.document.getElementsByTagName('script');
    for (var i=0; i<scripts.length; i++) {
      let script = scripts[i];
      if (isNarcissusType(script.getAttribute('type'))) {
        // Loading Narcissus can be slow, so only load it once we find a script
        if (!narcLoaded) {
          loadNarcissus();
          narcLoaded = true;
        }
        runScript(script);
      }
    }
  }

  // Run all scripts on the page, regardless of the specified type
  function runAllScripts(){
    loadNarcissus();
    var scripts = content.document.getElementsByTagName('script');
    for (var i=0; i<scripts.length; i++) {
      runScript(scripts[i]);
    }
  }

  // Set listeners to use Narcissus
  function handleListeners() {
    var actions = [ 'abort', 'blur', 'change', 'click', 'dblclick', 'error',
        'focus', 'keydown', 'keypress', 'keyup', 'load', 'mousedown', 'mouseup',
        'mouseout', 'mouseover', 'mousemove', 'reset', 'resize', 'select', 'submit', 'unload' ];
    var elems = content.document.getElementsByTagName('*');
    for (var i=0; i<elems.length; i++) {
      let elem = elems[i];
      for (let j=0; j<actions.length; j++) {
        let action = actions[j];
        if (elem.getAttribute('on' + action)) {
          (function() {
            let code = elem.getAttribute('on' + action);
            // Add ids to elements with listeners that currently do not have ids
            if (!elem.id) {
              let newID = generateUniqueId();
              elem.setAttribute('id', newID);
            }
            // TODO: Fix this -- there has to be a cleaner way.  Also, need more than just style.
            let f = '(function() { var style=this.style; ' + code + '}).apply(' + elem.id + ');';
            let fun = function(evnt){
              Narcissus.interpreter.global.event = evnt;
              evaluate(f);
              Narcissus.interpreter.global.event = undefined;
            };
            elem.addEventListener(action,
                fun,
                false);
            // Fire load actions immediately
            if (action === "load") {
              fun();
            }
          })();
        }
      }
    }
  }

  // Generate unique ids for tagging elements without ids
  var generateUniqueId = (function() {
    var id=0;
    return function() {
      return "narcUid" + id++;
    }
  })();

  // Return true if the page explicitly sets the default script type to 'text/narcissus'
  Zaphod.isScriptEngineForPage = function() {
    var metaElems = content.document.getElementsByTagName('meta');
    for (var i=0; i<metaElems.length; i++) {
      var elem = metaElems[i];
      if (elem.getAttribute('http-equiv') === "Content-Script-Type"
          && isNarcissusType(elem.getAttribute('content'))) {
        return true;
      }
    }
    return false;
  }

  // Return true if the script tag specifies narcissus
  function isNarcissusType(scriptType) {
    return scriptType === "application/narcissus" || scriptType === "text/narcissus";
  }

  // Create a handler to search for child elements for unknown properties
  function createElementHandler(elem) {
    var handler = Narcissus.definitions.makePassthruHandler(elem);
    /*///// Is 'has' needed?
    handler.has = function(name) {
      if (name in elem) { return true; }

      var children = elem.getElementsByTagName('*');
      for (let i=0; i<children.length; i++) {
        let child = children[i];
        if (child.name === name) {
          return true;
        }
      }
      return false;
    }
    //*///////////
    handler.get = function(receiver, name) {
      if (elem[name]) {
        if (Narcissus.definitions.isNativeCode(elem[name])) {
          return function() { return elem[name].apply(elem, arguments); };
        }
        else return elem[name];
      }

      var matches = [];
      var children = elem.getElementsByTagName('*');
      for (let i=0; i<children.length; i++) {
        let child = children[i];
        if (child.name === name) {
          matches.push(child);
        }
      }
      switch (matches.length) {
        case 0:
          return undefined;
        case 1:
          return Proxy.create(createElementHandler(matches[0]));
        default:
          return matches;
      }
    }
    return handler;
  }

  // Reads a file from the chrome code and returns a string of its contents
  function read(file) {
    var ioService=Components.classes["@mozilla.org/network/io-service;1"]
        .getService(Components.interfaces.nsIIOService);
    var scriptableStream=Components
        .classes["@mozilla.org/scriptableinputstream;1"]
        .getService(Components.interfaces.nsIScriptableInputStream);

    var channel=ioService.newChannel(file,null,null);
    var input=channel.open();

    scriptableStream.init(input);
    var str=scriptableStream.read(input.available());
    scriptableStream.close();
    input.close();

    return str;
  }

  // Initializes the DOM, either by wrapping the host DOM in a proxy and making
  // it available to Narcissus, or by loading dom.js and connecting that to
  // the host DOM.
  function loadDOM() {
    if (Zaphod.options.useDomjs) {
      Zaphod.log('Loading dom.js');
      var domjs = read('chrome://zaphod/content/domNarc.js');
      evaluate(domjs, 'domNarc.js', 1);

      // Utilities needed for dom.js
      var utils = read('chrome://zaphod/content/utils.js');
      evaluate(utils, 'utils.js', 1);

      // Copy the host DOM
      Narcissus.interpreter.global['hostDoc'] = content.document;
      evaluate('copyDOMintoDomjs()');
      //FIXME: Clear out utils and hostDoc from narcissus object
    }
    else {
      // Use the underlying DOM within Zaphod
      var documentHandler = createElementHandler(content.document);
      Narcissus.interpreter.global.document = Proxy.create(documentHandler);
    }

    evaluate("window = this");

    Narcissus.interpreter.getValueHook = function(name) {
      var value = content.document.getElementById(name);
      if (value) {
        return Proxy.create(createElementHandler(value));
      }
      else return undefined;
    }

  }

  // Loads the Narcissus scripts
  function loadNarcissus() {
    if (this.Narcissus) return;

    let baseURL = 'chrome://zaphod/content/';
    eval(read(baseURL + 'narcissus/jsdefs.js'));
    eval(read(baseURL + 'narcissus/jslex.js'));
    eval(read(baseURL + 'narcissus/jsparse.js'));
    eval(read(baseURL + 'narcissus/jsresolve.js'));
    Narcissus.options.hiddenHostGlobals.document = true;
    Narcissus.options.hiddenHostGlobals.content = true;
    Narcissus.options.hiddenHostGlobals.setInterval = true;
    Narcissus.options.hiddenHostGlobals.setTimeout = true;
    eval(read(baseURL + 'narcissus/jsexec.js'));
    eval(read(baseURL + 'browserAPIs.js'));

    loadDOM();
  }

  Zaphod.onPageLoad = function(aEvent) {
    // Execute the JS on the page with Narcissus, if it is the specified engine.
    if (Zaphod.isActive() || Zaphod.isScriptEngineForPage()) {
      runAllScripts();
      handleListeners();
    }
    // Otherwise only load the scripts that are explicitly set to use Narcissus.
    else {
      runNarcissusScripts();
    }
  }

  Zaphod.onPageUnload = function(aEvent) {
    // Eliminate narcissus
    if (this.Narcissus) { delete this.Narcissus; }
  }
}(Zaphod));

window.addEventListener('load', function() { Zaphod.init(); }, false);
window.addEventListener('unload', function() { Zaphod.shutdown(); }, false);

window.addEventListener('pagehide', Zaphod.onPageUnload, false);

// Add listener for uninstalling this plugin
try {
  Components.utils.import("resource://gre/modules/AddonManager.jsm");
  AddonManager.addAddonListener(uninstallationListener);
}
catch (e) {}

