(function(){
  'use strict';
  var root=document.getElementById('tt-match');
  var catalogUrl=root.getAttribute('data-catalog-url');
  var xlsxUrl=root.getAttribute('data-xlsx-url'),pdfUrl=root.getAttribute('data-pdf-url');
  var pdfWorker=root.getAttribute('data-pdf-worker-url');
  var sessionApiUrl=root.getAttribute('data-session-api-url')||'';
  var customerKey=root.getAttribute('data-customer-key')||'customer',storageKey='tt-match-saved-'+customerKey;
  var MATCHER_VERSION=12;
  var products=[],productsByFamily={},productsBySku={},rows=[],activeFilter='all',sortKey='row',sortDirection=1,nextRow=1,storageReady=false,catalogReady=false,savedMatcherVersion=0,suggestionPage=1,suggestionPageSize=9,pendingDeletes={},uploadJob=null,manualContext=null,currentSessionHandle='',currentSessionName='',sourceFileName='',baseColumns=['row','inputBrand','inputId','inputTitle','quantity','unit','status','category','tengSku','tengTitle','unspsc','actions'],columnOrder=baseColumns.slice(),visibleColumns=baseColumns.slice(),columnWidths={},columnMinWidths={row:40,inputBrand:52,inputId:76,inputTitle:120,quantity:40,unit:40,status:44,category:82,tengSku:76,tengTitle:150,unspsc:90,actions:92},draggedColumn='',resizeState=null;
  var columnLabels={row:'Row',inputBrand:'Brand',inputId:'Item ID',inputTitle:'Description',quantity:'Qty',unit:'Unit',status:'Status',category:'Category',tengSku:'Teng ID',tengTitle:'Teng match',unspsc:'UNSPSC',actions:'Actions'};
  var $=function(id){return document.getElementById(id);};
  var els={form:$('ttm-search-form'),searchPanel:$('ttm-start-panel'),startTitle:$('ttm-start-title'),startIntro:$('ttm-start-intro'),manualBanner:$('ttm-manual-context'),manualLabel:$('ttm-manual-label'),manualCancel:$('ttm-manual-cancel'),query:$('ttm-query'),file:$('ttm-file'),status:$('ttm-status'),suggestions:$('ttm-suggestions'),pagination:$('ttm-pagination'),body:$('ttm-body'),empty:$('ttm-empty'),download:$('ttm-download'),clearSaved:$('ttm-clear-saved'),saveSession:$('ttm-save-session'),savedSessions:$('ttm-saved-sessions'),saveState:$('ttm-save-state'),saveDialog:$('ttm-save-dialog'),saveForm:$('ttm-save-form'),sessionName:$('ttm-session-name'),sessionStatus:$('ttm-session-status'),sessionsDialog:$('ttm-sessions-dialog'),sessionList:$('ttm-session-list'),dataInfoTrigger:$('ttm-info-trigger'),dataInfoBox:$('ttm-info-box'),dataInfoClose:$('ttm-info-close'),clearDialog:$('ttm-clear-dialog'),clearFinalDialog:$('ttm-clear-final-dialog'),uploadDialog:$('ttm-upload-dialog'),uploadFileName:$('ttm-upload-filename'),uploadMessage:$('ttm-upload-message'),uploadProgress:$('ttm-upload-progress'),uploadPercent:$('ttm-upload-percent'),uploadCancel:$('ttm-upload-cancel'),columnsTrigger:$('ttm-columns-trigger'),columnsMenu:$('ttm-columns-menu'),columnOptions:$('ttm-column-options')};

  function text(v){return v===undefined||v===null?'':String(v).trim();}
  function skuKey(v){return text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function clean(v){return text(v).toLowerCase().replace(/[™®©]/g,'').replace(/([a-z])([0-9])/g,'$1 $2').replace(/([0-9])([a-z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').replace(/\binsulted\b/g,'insulated').replace(/\ballenkeys?\b/g,'allen key').replace(/\blongnose\b/g,'long nose').replace(/\bfarrel\b/g,'ferrule').replace(/\bmultipul\b/g,'multiple').trim();}
  function displayCase(value){
    var source=text(value).replace(/\s+/g,' ').trim(),letters=source.replace(/[^A-Za-z]/g,'');
    if(!letters||letters.length<3||source.replace(/[^A-Z]/g,'').length/letters.length<.78)return source;
    var preserved=/^(?:AC|DC|VDE|LED|USB|PVC|HSS|SDS|PH|PZ|TX|TORX|MM|CM|M|V|KV|A|MA|W|KW|NM|KG|G|ML|L|EA|UOM|UNSPSC)$/i;
    return source.split(/(\s+|[-–—])/).map(function(part,index){
      if(/^\s+$|^[-–—]$/.test(part)||!/[A-Za-z]/.test(part))return part;
      if(/\d/.test(part)||preserved.test(part))return part.toUpperCase();
      var lower=part.toLowerCase();return lower.charAt(0).toUpperCase()+lower.slice(1);
    }).join('');
  }
  function shortUnit(value){var unit=text(value);return /^(?:piece|pieces|pc|pcs)$/i.test(unit)?'pc':unit;}
  function esc(v){return text(v).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
  function icon(name){
    var paths={check:'<path d="m5 12 4 4L19 6"></path>',plus:'<path d="M12 5v14M5 12h14"></path>',previous:'<path d="m15 18-6-6 6-6"></path>',next:'<path d="m9 18 6-6-6-6"></path>',ignore:'<circle cx="12" cy="12" r="9"></circle><path d="m6 6 12 12"></path>',warning:'<path d="M12 3 2.5 20h19L12 3Z"></path><path d="M12 9v4M12 17h.01"></path>',confirmed:'<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>',restore:'<path d="M4 7v5h5"></path><path d="M5.5 16a8 8 0 1 0 .5-9l-2 5"></path>',search:'<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path>',close:'<path d="m6 6 12 12M18 6 6 18"></path>',expand:'<path d="m8 10 4 4 4-4"></path>',collapse:'<path d="m8 14 4-4 4 4"></path>',parts:'<path d="M4 6h16M4 12h16M4 18h16"></path>',duplicate:'<rect x="8" y="8" width="11" height="11" rx="1"></rect><path d="M16 8V5H5v11h3"></path>',info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7h.01"></path>',tag:'<path d="M20 13 13 20 4 11V4h7l9 9Z"></path><path d="M8 8h.01"></path>'};
    return '<svg class="ttm-icon" aria-hidden="true" viewBox="0 0 24 24">'+(paths[name]||'')+'</svg>';
  }
  function setStatus(message,tone){els.status.textContent=message;els.status.dataset.tone=tone||'';}
  function setUploadProgress(job,percent,message){if(!job||job!==uploadJob)return;var value=Math.max(0,Math.min(100,Math.round(percent)));els.uploadProgress.value=value;els.uploadPercent.textContent=value+'%';els.uploadMessage.textContent=message;}
  var libraryPromises={};
  function loadLibrary(url,globalName){
    if(window[globalName])return Promise.resolve(window[globalName]);if(libraryPromises[globalName])return libraryPromises[globalName];
    libraryPromises[globalName]=new Promise(function(resolve,reject){var script=document.createElement('script');script.src=url;script.defer=true;script.onload=function(){window[globalName]?resolve(window[globalName]):reject(new Error('The file reader did not initialise.'));};script.onerror=function(){reject(new Error('The file reader could not be loaded. Please retry.'));};document.head.appendChild(script);});return libraryPromises[globalName];
  }
  function openUploadProgress(file){uploadJob={cancelled:false,fileName:file.name,controller:new AbortController()};els.uploadFileName.textContent=file.name;setUploadProgress(uploadJob,2,'Preparing file…');els.uploadCancel.disabled=false;els.uploadCancel.innerHTML=icon('close')+'Cancel upload';els.uploadDialog.showModal();return uploadJob;}
  function closeUploadProgress(job){if(job!==uploadJob)return;if(els.uploadDialog.open)els.uploadDialog.close();uploadJob=null;}
  function nextFrame(){return new Promise(function(resolve){setTimeout(resolve,0);});}
  function queryVariants(query){
    var base=clean(query),variants=[base],pairs=[
      [/\bspanners?\b/g,'wrench'],[/\bwrench(?:es)?\b/g,'spanner'],
      [/\ballen keys?\b/g,'hex key'],[/\bhex keys?\b/g,'allen key'],
      [/\bwire strippers?\b/g,'wire stripping plier'],[/\bwire stripping pliers?\b/g,'wire stripper'],
      [/\bstar screwdrivers?\b/g,'tx screwdriver'],[/\btorx screwdrivers?\b/g,'tx screwdriver'],[/\btx screwdrivers?\b/g,'torx screwdriver'],
      [/\bside cutters?\b/g,'diagonal cutting plier'],[/\bdiagonal cutting pliers?\b/g,'side cutter'],
      [/\bmole grips?\b/g,'locking plier'],[/\blocking pliers?\b/g,'mole grip'],
      [/\bvoltage testers?\b/g,'1000v tester'],[/\b1000\s*v testers?\b/g,'voltage tester'],
      [/\bshifting spanners?\b/g,'adjustable wrench'],[/\badjustable wrench(?:es)?\b/g,'shifting spanner'],
      [/\bbow saws?\b/g,'hacksaw'],[/\bhack saws?\b/g,'hacksaw'],[/\bhacksaws?\b/g,'hack saw'],
      [/\bvde\b/g,'insulated'],[/\b1000\s*v(?:olt)?s?\b/g,'insulated'],[/\binsulated\b/g,'vde']
    ];
    pairs.forEach(function(pair){if(pair[0].test(base))variants.push(base.replace(pair[0],pair[1]));pair[0].lastIndex=0;});
    return variants.filter(function(value,index,array){return value&&array.indexOf(value)===index;});
  }
  var familyRules=[
    ['voltage-tester',/\b(?:voltage|volt|electrical)\b.*\btesters?\b|\b\d+\s*v\b.*\btesters?\b|\btesters?\b.*\b(?:voltage|volt|electrical)\b/],
    ['wire-stripper',/\b(?:wire|cable)\b.*\bstripp(?:ers?|ing)\b|\bstripp(?:ers?|ing)\b.*\b(?:wire|cable)\b/],
    ['cable-crimper',/\b(?:cable|lug|boot lace|ferrule)\b.*\bcrimp(?:ers?|ing)?\b|\bcrimp(?:ers?|ing)?\b.*\b(?:cable|lug|boot lace|ferrule)\b/],
    ['long-nose-plier',/\b(?:long nose|needle nose)\b.*\bpliers?\b|\bpliers?\b.*\b(?:long nose|needle nose)\b/],
    ['fish-tape',/\bfish\b.*\btapes?\b|\btapes?\b.*\bfish\b/],
    ['tape-measure',/\b(?:tape measures?|measuring tapes?)\b/],
    ['circuit-finder',/\bcircuit\b.*\bfinders?\b|\bfinders?\b.*\bcircuit\b/],
    ['soldering-iron',/\bsolder(?:ing)?\b.*\birons?\b|\birons?\b.*\bsolder(?:ing)?\b/],
    ['hole-saw',/\bhole\b.*\bsaws?\b|\bsaws?\b.*\bhole\b/],
    ['grinder',/\b(?:cordless|angle|bench)?\s*grinders?\b/],
    ['adhesive-tape',/\b(?:insulation|insulating|electrical|nitto)\b.*\btapes?\b/],
    ['connector-block',/\b(?:connector|terminal)\b.*\bblocks?\b|\bblocks?\b.*\b(?:connector|terminal)\b/],
    ['ferrule',/\b(?:ferrules?|boot\s*lace)\b/],
    ['cable-tie',/\bcable\b.*\bties?\b|\bties?\b.*\bcable\b/],
    ['solder',/\b(?:silver\s+)?solders?\b/],
    ['bow-saw-blade',/\bbow\b.*\bsaw\b.*\bblade\b|\bblade\b.*\bbow\b.*\bsaw\b/],
    ['hacksaw',/\b(?:mini )?hack\s*saw\b.*\b(?:w|with)\b.*\bblade\b/],
    ['hacksaw-holder',/\bhack\s*saw\b.*\b(?:holder|frame)\b|\b(?:holder|frame)\b.*\bhack\s*saw\b/],
    ['hacksaw-blade',/\bhack\s*saw\b.*\bblade\b|\bblade\b.*\bhack\s*saw\b/],
    ['knife-blade',/\b(?:knife|trimming)\b.*\bblades?\b|\bblades?\b.*\b(?:knife|trimming)\b/],
    ['saw-blade',/\b(?:saw|jigsaw|reciprocating|circular)\b.*\bblade\b|\bblade\b.*\b(?:saw|jigsaw|reciprocating|circular)\b/],
    ['torque-wrench',/\btorque\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\btorque\b/],
    ['impact-wrench',/\bimpact\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\bimpact\b/],
    ['adjustable-wrench',/\b(?:adjustable|shifting)\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\b(?:adjustable|shifting)\b/],
    ['combination-wrench',/\bcombination\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\bcombination\b/],
    ['open-end-wrench',/\b(?:open ended?|open end|open jaw)\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\b(?:open ended?|open end|open jaw)\b/],
    ['ring-wrench',/\b(?:ring|box end)\b.*\b(?:wrench|spanner)\b|\b(?:wrench|spanner)\b.*\b(?:ring|box end)\b/],
    ['hex-key',/\b(?:allen|hex(?:agon)?)\b.*\bkeys?\b|\bkeys?\b.*\b(?:allen|hex(?:agon)?)\b/],
    ['auger-bit',/\bscotch(?:ed)?\s+eye\b.*\bauger\b|\bauger\b.*\b(?:bits?|scotch(?:ed)?\s+eye)\b|\bbits?\b.*\bauger\b/],
    ['drill-bit',/\b(?:drill|masonry|wood|metal)\b.*\bbit\b|\bbit\b.*\bdrill\b/],
    ['hex-bit-socket-set',/\bhex\b.*\bbit\b.*\bsocket\b.*\bset\b|\bsocket\b.*\bhex\b.*\bbit\b.*\bset\b/],
    ['double-ended-socket',/\b(?:double sided|double ended)\b.*\bsockets?\b|\bsockets?\b.*\b(?:double sided|double ended)\b/],
    ['socket-set',/\bsockets?\b.*\bsets?\b|\bsets?\b.*\bsockets?\b/],
    ['pipe-wrench',/\bpipe\b.*\b(?:wrenches|wrench|spanners|spanner)\b/],
    ['bolt-cutter',/\bbolt\b.*\bcutters?\b|\bcutters?\b.*\bbolt\b/],
    ['diagonal-cutter',/\b(?:diagonal|side)\b.*\bcutters?\b|\bcutters?\b.*\b(?:diagonal|side)\b/],
    ['cable-cutter',/\bcable\b.*\bcutters?\b|\bcutters?\b.*\bcable\b/],
    ['combination-plier',/\bcombination\b.*\bpliers?\b|\bpliers?\b.*\bcombination\b/],
    ['socket-accessory',/\b(?:flex handles?|extension bars?|adaptors?|adapters?|universal joints?)\b/],
    ['socket',/\bsockets?\b/],['ratchet',/\bratchets?\b/],['wrench',/\b(?:wrenches|wrench|spanners|spanner)\b/],
    ['pliers',/\b(?:pliers?|nippers?|pincers?|side cutters?|diagonal cutters?|vice grips?|vise grips?)\b/],
    ['screwdriver',/\bscrew\s*drivers?\b|\bscrewdrivers?\b/],['bit',/\b(?:driver )?bits?\b/],
    ['hacksaw',/\bhack\s*saws?\b/],['saw',/\b(?:saws?|jigsaws?|reciprocating saws?)\b/],
    ['hammer',/\b(?:hammers?|mallets?|sledgehammers?)\b/],['pick',/\b(?:pickaxe|pick head|pick type|type pick|pick beater|universal pick)\b/],['chisel',/\bchisels?\b/],['punch',/\bpunch(?:es)?\b/],
    ['cutting-disc',/\b(?:cutting|cut off)\b.*\b(?:disc|wheel)\b|\b(?:disc|wheel)\b.*\b(?:cutting|cut off)\b/],
    ['grinding-disc',/\bgrind(?:ing)?\b.*\b(?:disc|wheel)\b|\b(?:disc|wheel)\b.*\bgrind(?:ing)?\b/],
    ['file',/\bfiles?\b/],['knife',/\b(?:knives|knife|cutters?|scrapers?)\b/],['drill',/\bdrills?\b/],
    ['shovel',/\bshovels?\b/],['spade',/\bspades?\b/],['wheelbarrow',/\bwheel\s*barrows?\b/],
    ['circlip',/\bcirclip\b/],['clamp',/\bclamps?\b/],['vice',/\b(?:vices?|vises?)\b/],
    ['snips',/\b(?:snips?|shears?)\b/],['puller',/\bpullers?\b/],['pry-bar',/\b(?:pry|wrecking)\b.*\bbars?\b/],
    ['measuring',/\b(?:measuring|measure|tape|calipers?|micrometers?|rulers?|levels?)\b/],
    ['lighting',/\b(?:head\s*lamps?|lamps?|lights?|torches?)\b/],['tool-kit',/\btools?\b.*\bkits?\b|\bkits?\b.*\btools?\b/],['storage',/\b(?:storage|cabinet|toolbox|tool box|trolley|workstation|chest)\b/]
  ];
  var verifiedInputRules=[
    {pattern:/\bfluke\s+2\s*ac\b/,name:'Non-contact AC voltage detector',family:'voltage-tester',subtype:'non-contact-voltage-detector',contactMode:'non-contact',voltageMin:90,voltageMax:1000,evidenceUrl:'https://www.fluke.com/en-us/product/electrical-testing/basic-testers/fluke-2ac'}
  ];
  function productFamily(value){var normalized=clean(value);for(var i=0;i<familyRules.length;i++)if(familyRules[i][1].test(normalized))return familyRules[i][0];return'';}
  function compatibleFamily(queryFamily,candidateFamily){
    if(!queryFamily||!candidateFamily)return true;
    if(queryFamily===candidateFamily)return true;
    if(queryFamily==='pliers'&&candidateFamily==='combination-plier')return true;
    if(queryFamily==='combination-plier'&&candidateFamily==='pliers')return false;
    if((queryFamily==='bow-saw-blade'||queryFamily==='hacksaw-blade')&&candidateFamily==='saw')return false;
    var related={
      wrench:['adjustable-wrench','combination-wrench','open-end-wrench','ring-wrench','torque-wrench','impact-wrench','pipe-wrench'],
      socket:['double-ended-socket','socket-set','hex-bit-socket-set','socket-accessory'],
      saw:['hacksaw','hacksaw-holder','hacksaw-blade','bow-saw-blade','saw-blade'],
      hacksaw:['saw','hacksaw-holder','hacksaw-blade','bow-saw-blade','saw-blade'],
      'bow-saw-blade':['hacksaw','hacksaw-blade','hacksaw-holder'],
      'hacksaw-blade':['hacksaw','hacksaw-holder','bow-saw-blade'],
      'hacksaw-holder':['hacksaw','hacksaw-blade','bow-saw-blade','saw-blade','saw'],
      'saw-blade':['hacksaw','hacksaw-blade','hacksaw-holder','saw']
    };
    return !!((related[queryFamily]&&related[queryFamily].indexOf(candidateFamily)!==-1)||(related[candidateFamily]&&related[candidateFamily].indexOf(queryFamily)!==-1));
  }
  var intentStopWords={type:1,dim:1,dimension:1,size:1,length:1,width:1,height:1,standard:1,colour:1,color:1,material:1,steel:1,high:1,speed:1,hardpoint:1,shatterproof:1,each:1,unit:1,qty:1,quantity:1,brand:1,part:1,number:1,pn:1,fg:1,sans:1,lasher:1,fluke:1,gedore:1,stanley:1,kingtony:1,snapon:1,bahco:1,knipex:1,toptul:1,mastercraft:1,torkcraft:1};
  function voltageRange(value){
    var normalized=text(value).toLowerCase().replace(/(\d),(\d)/g,'$1.$2'),range=normalized.match(/\b(\d{2,4})\s*(?:-|–|—|to)\s*(\d{2,4})\s*(?:v|volt|volts)\b/),single=normalized.match(/\b(\d{2,4})\s*(?:v|volt|volts)\b/);
    if(range)return {min:Number(range[1]),max:Number(range[2])};
    if(single)return {min:0,max:Number(single[1])};
    return null;
  }
  function identifyRequestedItem(value){
    var normalized=clean(value),known=null;
    for(var i=0;i<verifiedInputRules.length;i++)if(verifiedInputRules[i].pattern.test(normalized)){known=verifiedInputRules[i];break;}
    var family=known?known.family:productFamily(normalized),contactMode=known?known.contactMode:(/\b(?:non contact|contactless|ncv|volt alert|voltage detector pen)\b/.test(normalized)?'non-contact':(/\b(?:contact tester|screwdriver tester|test screwdriver)\b/.test(normalized)?'contact':'')),range=known&&known.voltageMin!==undefined?{min:known.voltageMin,max:known.voltageMax}:voltageRange(normalized);
    return {name:known?known.name:(familyLabel(family)||text(value)),family:family,subtype:known?known.subtype:'',contactMode:contactMode,voltageMin:range?range.min:null,voltageMax:range?range.max:null,evidenceUrl:known?known.evidenceUrl:''};
  }
  function analyzeInput(value){
    var normalized=clean(value),identified=identifyRequestedItem(normalized),family=identified.family||productFamily(normalized),tokens=normalized.split(' ').map(tokenStem).filter(function(token){return token.length>1&&!intentStopWords[token]&&!/^\d+(?:\.\d+)?$/.test(token)&&!/^fg\d+$/.test(token);});
    var unique=tokens.filter(function(token,index,array){return array.indexOf(token)===index;});
    return {normalized:normalized,family:family,tokens:unique,variants:queryVariants(normalized),identified:identified};
  }
  function familyLabel(family){return {'bow-saw-blade':'bow saw blade','hacksaw-blade':'hacksaw blade','hacksaw-holder':'hacksaw frame','saw-blade':'saw blade','adjustable-wrench':'adjustable wrench','combination-wrench':'combination wrench','open-end-wrench':'open-end wrench','ring-wrench':'ring wrench','torque-wrench':'torque wrench','impact-wrench':'impact wrench','pipe-wrench':'pipe wrench','hex-key':'hex key','auger-bit':'auger bit','drill-bit':'drill bit','socket-set':'socket set','hex-bit-socket-set':'hex-bit socket set','double-ended-socket':'double-ended socket','bolt-cutter':'bolt cutter','diagonal-cutter':'diagonal cutter','cable-cutter':'cable cutter','combination-plier':'combination plier','pry-bar':'pry bar'}[family]||family||'';}
  function categoryLabel(family){
    var broad={hacksaw:'Hacksaw','hacksaw-blade':'Hacksaw','hacksaw-holder':'Hacksaw','bow-saw-blade':'Hacksaw','saw-blade':'Saw blades',saw:'Saws',wrench:'Spanners & wrenches','adjustable-wrench':'Spanners & wrenches','combination-wrench':'Spanners & wrenches','open-end-wrench':'Spanners & wrenches','ring-wrench':'Spanners & wrenches','torque-wrench':'Torque tools','impact-wrench':'Impact tools','pipe-wrench':'Pipe wrenches','hex-key':'Hex & TX keys','auger-bit':'Auger bits','drill-bit':'Drill bits','bit':'Bits & drivers','hex-bit-socket-set':'Socket sets','socket-set':'Socket sets','double-ended-socket':'Sockets','socket-accessory':'Sockets & accessories',socket:'Sockets','pliers':'Pliers','combination-plier':'Pliers','long-nose-plier':'Pliers','bolt-cutter':'Bolt cutters','diagonal-cutter':'Cutters','cable-cutter':'Cutters','wire-stripper':'Wire strippers','cable-crimper':'Crimping tools','voltage-tester':'Electrical testers','fish-tape':'Cable installation tools','tape-measure':'Measuring tools','circuit-finder':'Electrical testers','soldering-iron':'Soldering tools','hole-saw':'Hole saws',grinder:'Power tools','adhesive-tape':'Electrical consumables','connector-block':'Electrical consumables',ferrule:'Electrical consumables','cable-tie':'Electrical consumables',solder:'Soldering consumables','tool-kit':'Tool kits',screwdriver:'Screwdrivers',hammer:'Hammers',pick:'Picks',chisel:'Chisels',punch:'Punches','cutting-disc':'Cutting discs','grinding-disc':'Grinding discs',file:'Files',knife:'Knives',drill:'Drills',shovel:'Shovels',spade:'Spades',wheelbarrow:'Wheelbarrows',circlip:'Circlip pliers',clamp:'Clamps',vice:'Vices',snips:'Snips',puller:'Pullers','pry-bar':'Pry bars',measuring:'Measuring tools',lighting:'Lighting',storage:'Tool storage'};
    if(broad[family])return broad[family];var label=familyLabel(family);return label?label.charAt(0).toUpperCase()+label.slice(1):'N/A';
  }
  function searchSeed(value){var analysis=analyzeInput(value),label=familyLabel(analysis.family);if(label){var spec=specifications(value)[0];return label+(spec?' '+(Math.round(spec.value*100)/100)+spec.unit:'');}return analysis.tokens.slice(0,4).join(' ')||text(value);}
  function specifications(value){
    var raw=text(value).toLowerCase().replace(/(\d),(\d)/g,'$1.$2'),found=[];
    function add(unit,number){var parsed=Number(number),converted=false;if(!isFinite(parsed))return;if(unit==='m'){unit='mm';parsed*=1000;converted=true;}if(unit==='cm'){unit='mm';parsed*=10;converted=true;}if(unit==='inch'||unit==='inches'||unit==='in'||unit==='"'){unit='mm';parsed*=25.4;converted=true;}found.push({unit:unit,value:parsed,converted:converted});}
    raw.replace(/\b(\d+(?:\.\d+)?)\s*(?:x|×|to|-)\s*(\d+(?:\.\d+)?)\s*mm\b/g,function(match,first,second){add('mm',first);add('mm',second);return match;});
    raw.replace(/\b(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*mm\b/g,function(match,first,second){add('mm',first);add('mm',second);return match;});
    raw.replace(/\b(\d+(?:\.\d+)?)\s*(mm|cm|tpi|nm|kg|inch|inches|in|m)(?=\b|[^a-z])/g,function(match,number,unit){add(unit,number);return match;});
    raw.replace(/\b(\d+(?:\.\d+)?)\s*mt\b/g,function(match,number){add('m',number);return match;});
    raw.replace(/\b(1\/4|3\/8|1\/2|3\/4)\s*(?:inch|inches|in|"|drive)\b/g,function(match,fraction){var parts=fraction.split('/');add('inch',Number(parts[0])/Number(parts[1]));return match;});
    return found.filter(function(item,index,array){return array.findIndex(function(other){return other.unit===item.unit&&Math.abs(other.value-item.value)<0.01;})===index;});
  }
  function pieceCount(value){var match=clean(value).match(/\b(\d+)\s*(?:piece|pieces|pc)\b/);return match?Number(match[1]):0;}
  function inputAttributes(value){
    var q=clean(value),drive=(q.match(/\b(1\/4|3\/8|1\/2|3\/4)\s*(?:inch|in|drive|square)\b/)||[])[1]||'',profile='';
    if(/\b(?:tx|torx|star)\s*\d*\b/.test(q))profile='torx';else if(/\b(?:ph|phillips|cross head)\s*\d*\b/.test(q))profile='phillips';else if(/\b(?:pz|pozi|pozidriv)\s*\d*\b/.test(q))profile='pozidriv';else if(/\b(?:slotted|flat head|flat screwdriver)\b/.test(q))profile='slotted';else if(/\b(?:allen|hex)\b/.test(q))profile='hex';
    var powerSource=/\bcordless|battery\b/.test(q)?'cordless':/\bair|pneumatic\b/.test(q)?'pneumatic':/\bcorded|electric\b/.test(q)?'corded':'';
    var form=/\b(?:replacement|spare)\b.*\bblades?\b|\b(?:saw|hacksaw|knife|utility)\s*blades?\b/.test(q)?'blade':/\b(?:frame|holder|hacksaw)\b/.test(q)?'frame':'tool';
    return {drive:drive,profile:profile,powerSource:powerSource,form:form,pieceCount:pieceCount(q),specifications:specifications(value)};
  }
  function interpretedInput(value,providedBrand,providedModel){
    var source=text(value),q=clean(source),analysis=analyzeInput(source),attributes=inputAttributes(source),brands=['Teng Tools','Lasher Tools','Craftmaster','Stanley','Fluke','Gedore','Bahco','Knipex','King Tony','Snap-on','Tork Craft','Mastercraft','Toptul'],brand=text(providedBrand),model=text(providedModel),administrative=[];
    if(!brand||/^(?:n a|not supplied|unknown)$/i.test(clean(brand)))for(var i=0;i<brands.length;i++)if(q.indexOf(clean(brands[i]))!==-1){brand=brands[i];break;}
    if(!model){var modelMatch=source.match(/\b(?:pn|p\/n|part\s*(?:no|number)|model|sku|ref(?:erence)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i);if(modelMatch)model=modelMatch[1];}
    source.split(/[,;]+/).forEach(function(part){var cleaned=clean(part);if(/^(?:\d{4,}|type\s*:|dim\s*:|supplier|stock|line|item|internal|range\s*:)/.test(cleaned)&&cleaned.indexOf(clean(analysis.identified.name))===-1)administrative.push(text(part));});
    return {productCategory:categoryLabel(analysis.family),productSubtype:analysis.identified.subtype||familyLabel(analysis.family),criticalSpecifications:attributes,secondarySpecifications:analysis.tokens.filter(function(token){return token!==tokenStem(analysis.family||'');}).slice(0,8),brand:brand||'',modelOrPartNumber:model||'',administrativeOrIrrelevant:administrative.slice(0,8)};
  }
  function criticalConflicts(query,productText){
    var wanted=inputAttributes(query),offered=inputAttributes(productText),conflicts=[];
    if(wanted.powerSource&&offered.powerSource&&wanted.powerSource!==offered.powerSource)conflicts.push('Power source conflict: requested '+wanted.powerSource+', candidate is '+offered.powerSource+'.');
    if(wanted.drive&&offered.drive&&wanted.drive!==offered.drive)conflicts.push('Drive-size conflict: requested '+wanted.drive+', candidate is '+offered.drive+'.');
    if(wanted.profile&&offered.profile&&wanted.profile!==offered.profile)conflicts.push('Profile conflict: requested '+wanted.profile+', candidate is '+offered.profile+'.');
    if(wanted.form==='tool'&&offered.form!=='tool')conflicts.push('Product-form conflict: a complete tool was requested, not a '+offered.form+'.');
    if(wanted.form!=='tool'&&offered.form!==wanted.form)conflicts.push('Product-form conflict: requested '+wanted.form+', candidate is '+offered.form+'.');
    if(wanted.pieceCount&&offered.pieceCount&&wanted.pieceCount!==offered.pieceCount)conflicts.push('Piece-count conflict: requested '+wanted.pieceCount+', candidate has '+offered.pieceCount+'.');
    if(wanted.specifications.length&&!specificationCompatible(query,productText))conflicts.push('Critical size or capacity does not match.');
    return conflicts;
  }
  function specificationScore(query,productText){
    var wanted=specifications(query),offered=specifications(productText),score=0;if(!wanted.length||!offered.length)return 0;
    ['mm','tpi','nm','kg'].forEach(function(unit){var expected=wanted.filter(function(item){return item.unit===unit;}),available=offered.filter(function(item){return item.unit===unit;});if(!expected.length||!available.length)return;var match=expected.some(function(a){return available.some(function(b){var tolerance=unit==='mm'?Math.max(1,a.value*0.02):0.01;return Math.abs(a.value-b.value)<=tolerance;});});score+=match?70:-180;});
    return score;
  }
  function specificationCompatible(query,productText){
    var wanted=specifications(query),offered=specifications(productText);if(!wanted.length)return true;
    return ['mm','tpi','nm','kg'].every(function(unit){
      var expected=wanted.filter(function(item){return item.unit===unit;}),available=offered.filter(function(item){return item.unit===unit;});if(!expected.length)return true;if(!available.length)return false;
      var remaining=available.slice(),matched=0;expected.forEach(function(a){var found=remaining.findIndex(function(b){var tolerance=unit==='mm'?(a.converted||b.converted?Math.max(1,a.value*0.02):0.11):0.01;return Math.abs(a.value-b.value)<=tolerance;});if(found!==-1){matched+=1;remaining.splice(found,1);}});
      return matched>0&&(available.length<expected.length||matched===expected.length);
    });
  }
  function distinctiveOverlap(query,productText){
    var ignored=/^(?:type|dim|dimension|size|length|width|standard|colour|color|steel|chrome|vanadium|heavy|duty|tool|tools|lasher|gedore|stanley|super|brand|wrench|wrenches|spanner|spanners|socket|sockets|plier|pliers|cutter|cutters|blade|blades|knife|knives|saw|hacksaw|hack|drill|bit|bits|set|kit|piece|pieces|with|and|for|the|each|fls)$/;
    var candidateTokens=clean(productText).split(' ').map(tokenStem),queryTokens=clean(query).split(' ').map(tokenStem).filter(function(token){return token.length>2&&!ignored.test(token)&&!/^[0-9]+$/.test(token);});
    return queryTokens.some(function(token){return candidateTokens.indexOf(token)!==-1;});
  }
  function productCapability(product){
    var facts=product&&product.matcherFacts||{},range=voltageRange(product&&product._searchText||'');
    return {family:facts.toolFamily||product&&product._family||'',subtype:facts.subtype||'',contactMode:facts.contactMode||(/\bnon contact\b/.test(product&&product._searchText||'')?'non-contact':(/\bcontact voltage tester\b/.test(product&&product._searchText||'')?'contact':'')),voltageMin:facts.voltageMin!==undefined?Number(facts.voltageMin):(range?range.min:null),voltageMax:facts.voltageMax!==undefined?Number(facts.voltageMax):(range?range.max:null)};
  }
  function capabilityAssessment(query,product){
    var requested=identifyRequestedItem(query),offered=productCapability(product),warnings=[];
    if(requested.family&&offered.family&&!compatibleFamily(requested.family,offered.family))return {safe:false,equivalence:'different-category',warning:'Different tool category.'};
    if(requested.contactMode&&offered.contactMode&&requested.contactMode!==offered.contactMode)warnings.push('Input is '+requested.contactMode+'; Teng product is '+offered.contactMode+'.');
    if(requested.voltageMin!==null&&requested.voltageMax!==null&&offered.voltageMin!==null&&offered.voltageMax!==null){
      if(requested.voltageMin<offered.voltageMin||requested.voltageMax>offered.voltageMax)warnings.push('Input range is '+requested.voltageMin+'–'+requested.voltageMax+' V; Teng product range is '+offered.voltageMin+'–'+offered.voltageMax+' V.');
    }
    return {safe:!warnings.length,equivalence:warnings.length?'closest-alternative':'category-compatible',warning:warnings.join(' '),requested:requested,offered:offered};
  }
  function automaticCandidate(query,suggestions){
    for(var i=0;i<suggestions.length;i++){
      var item=suggestions[i],product=item.product,productText=[product.title,product.catalogTitle,product.section,product.productType].join(' '),queryFamily=productFamily(query),candidateFamily=productFamily([product.title,product.catalogTitle].join(' '))||productFamily([product.section,product.productType].join(' '));
      if(item.score<640||!product.handle||!queryFamily||!candidateFamily||!productClassCompatible(query,product)||!compatibleFamily(queryFamily,candidateFamily)||criticalConflicts(query,productText).length||!capabilityAssessment(query,product).safe)continue;
      var wantedPieces=pieceCount(query),offeredPieces=pieceCount(productText);if(wantedPieces&&offeredPieces&&wantedPieces!==offeredPieces)continue;
      if(specifications(query).length||distinctiveOverlap(query,productText))return product;
    }
    return null;
  }
  function reviewCandidate(query,suggestions){
    var queryFamily=productFamily(query);if(!queryFamily)return null;
    for(var i=0;i<suggestions.length;i++){
      var item=suggestions[i],product=item.product,candidateFamily=product._family,productText=product._searchText;
      if(item.score<520||!candidateFamily||!productClassCompatible(query,product)||!compatibleFamily(queryFamily,candidateFamily)||criticalConflicts(query,productText).length)continue;
      if(candidateFamily!==queryFamily&&queryFamily!=='bow-saw-blade'&&!(queryFamily==='hacksaw-holder'&&candidateFamily==='hacksaw'))continue;
      var wanted=specifications(query),offered=product._specs||[];
      if(wanted.length&&offered.length&&!specificationCompatible(query,productText))continue;
      return product;
    }
    return null;
  }
  function desiredProductClass(query){var q=clean(query);if(/\b(?:complete )?(?:tool )?kits?\b/.test(q))return'kit';if(/\bsets?\b|\b\d+\s*(?:piece|pc)\b/.test(q))return'set';return'individual';}
  function productClassCompatible(query,product){return!!(product&&(skuKey(query)===skuKey(product.sku)||product.productClass===desiredProductClass(query)));}
  function tokenStem(token){return token.replace(/ies$/,'y').replace(/(?:ches|shes|xes|zes|ses)$/,'').replace(/s$/,'');}
  function textMatchScore(value,variants,maximum){
    var haystack=clean(value),best=0;if(!haystack)return 0;
    variants.forEach(function(variant,variantIndex){
      var variantMaximum=Math.max(240,maximum-(variantIndex*90));
      if(haystack.indexOf(variant)!==-1)best=Math.max(best,variantMaximum);
      var tokens=variant.split(' ').filter(function(token){return token.length>1;}),hayTokens=haystack.split(' ').map(tokenStem).filter(function(token){return token.length>1;});
      var hits=tokens.filter(function(token){var stem=tokenStem(token);return stem.length>1&&hayTokens.some(function(hay){return hay===stem||hay.indexOf(stem)===0||stem.indexOf(hay)===0;});}).length;
      if(tokens.length)best=Math.max(best,Math.round((hits/tokens.length)*(variantMaximum-120)));
    });
    return best;
  }
  function requestsElectricalInsulation(value){return productFamily(value)!=='voltage-tester'&&/\b(?:vde|insulated|1000\s*(?:v|volt)|iec\s*60900)\b/.test(clean(value));}
  function isElectricalInsulated(product){return /\b(?:vde|insulated|1000\s*(?:v|volt)|iec\s*60900)\b/.test(product&&product._searchText||'');}
  function normalizeProduct(raw){
    var sku=text(raw.sku||raw.itemId||raw.item_id||raw.articleNumber||raw.id);
    var title=text(raw.title||raw.product_name||raw.name||raw.description);
    var kitContents=Array.isArray(raw.kitContents)?raw.kitContents.map(function(item){return {sku:text(item.sku||item.itemId),title:text(item.title||item.description),keywords:text(item.keywords||item.bulletText)};}).filter(function(item){return item.sku||item.title;}):[];
    var product={sku:sku,title:text(raw.storeTitle||title),catalogTitle:title,section:text(raw.section||raw.category||raw.kind),productType:text(raw.productType||raw.product_type),productClass:text(raw.productClass||raw.product_class||'individual'),description:text(raw.description||raw.body||raw.body_html),keywords:text(raw.keywords||raw.tags),dataSheetUrl:text(raw.dataSheetUrl||raw.datasheetUrl),image:text(raw.image||raw.featuredImage||raw.featured_image),unspsc:text(raw.unspsc||raw.unspsc_code),unspscTitle:text(raw.unspscTitle||raw.unspsc_title),unspscVersion:text(raw.unspscVersion||'UNv260801'),confidence:text(raw.confidence),reviewStatus:text(raw.reviewStatus||raw.review_status),handle:text(raw.handle),kitContents:kitContents,matcherFacts:raw.matcherFacts&&typeof raw.matcherFacts==='object'?raw.matcherFacts:{}};
    product._titleSearchText=clean([product.title,product.catalogTitle,product.section,product.productType].join(' '));
    product._detailSearchText=clean([product.description,product.keywords].join(' '));
    product._searchText=clean([product._titleSearchText,product._detailSearchText].join(' '));
    product._family=productFamily([product.title,product.catalogTitle].join(' '))||productFamily([product.section,product.productType].join(' '));
    product._specs=specifications(product._searchText);
    return product;
  }
  function fallbackWinner(bucket,key){var entry=bucket[key];if(!entry||entry.total<3)return null;var codes=Object.keys(entry.codes).sort(function(a,b){return entry.codes[b].count-entry.codes[a].count;}),best=codes[0]&&entry.codes[codes[0]];return best&&best.count/entry.total>=.72?best:null;}
  function applyUnspscFallbacks(){
    var byFamily={},bySection={};
    var trustedFamilies={
      'adjustable-wrench':{code:'27111707',title:'Adjustable wrenches'},
      'combination-wrench':{code:'27111713',title:'Combination wrenches'},
      'open-end-wrench':{code:'27111706',title:'Open end wrenches'},
      'ring-wrench':{code:'27111743',title:'Ring wrenches'},
      'pipe-wrench':{code:'27111708',title:'Pipe wrenches'}
    };
    function collect(bucket,key,product){if(!key||!product.unspsc)return;var entry=bucket[key]||(bucket[key]={total:0,codes:{}}),code=product.unspsc;entry.total+=1;var item=entry.codes[code]||(entry.codes[code]={count:0,code:code,title:product.unspscTitle,version:product.unspscVersion});item.count+=1;}
    products.forEach(function(product){collect(byFamily,product._family,product);collect(bySection,clean(product.section||product.productType),product);});
    products.forEach(function(product){
      if(product.unspsc||/\b(?:spare|replacement|tray|badge|grille|slider)\b/.test(product._searchText))return;
      var fallback=trustedFamilies[product._family]||fallbackWinner(bySection,clean(product.section||product.productType))||fallbackWinner(byFamily,product._family);if(!fallback)return;
      product.unspsc=fallback.code;product.unspscTitle=fallback.title;product.unspscVersion=fallback.version||'UNv260801';product.confidence='Category-derived';product.reviewStatus='Confirm category-derived UNSPSC';product.unspscSource='category';
    });
  }
  function indexProducts(){productsByFamily={};productsBySku={};products.forEach(function(product){var key=product._family||'other';(productsByFamily[key]||(productsByFamily[key]=[])).push(product);productsBySku[skuKey(product.sku)]=product;});}
  function catalogArray(payload){
    if(Array.isArray(payload))return payload;
    if(payload&&Array.isArray(payload.items))return payload.items;
    if(payload&&payload.items&&typeof payload.items==='object')return Object.keys(payload.items).map(function(key){return payload.items[key];});
    if(payload&&Array.isArray(payload.products))return payload.products;
    return [];
  }
  function scoreProduct(product,query,preparedAnalysis){
    var analysis=preparedAnalysis||analyzeInput(query),q=analysis.normalized,variants=analysis.variants,id=clean(product.sku),title=clean(product.title),catalogTitle=clean(product.catalogTitle),titleText=product._titleSearchText,detailText=product._detailSearchText,productText=product._searchText,queryFamily=analysis.family,candidateFamily=product._family,score=0;
    if(!q)return 0;
    if(q===id)return 1200;
    if(variants.indexOf(title)!==-1||variants.indexOf(catalogTitle)!==-1)return 920+(product.handle?35:0);
    if(queryFamily&&candidateFamily&&!compatibleFamily(queryFamily,candidateFamily)&&product.productClass!=='kit')return 0;
    if(requestsElectricalInsulation(q)&&!isElectricalInsulated(product))return 0;
    if(!q.includes(' ')&&q.length>=4&&(id.indexOf(q)===0||q.indexOf(id)===0))score=760;
    score=Math.max(textMatchScore(titleText,variants,720),score);
    var detailScore=textMatchScore(detailText,variants,500),specificDetailTokens=analysis.tokens.filter(function(token){return token.length>2&&!/^(?:tool|professional|quality|product|secure|comfortable|strong|durable|steel|handle|brand)$/.test(token);});
    if(detailScore&&specificDetailTokens.length)score=Math.max(score,detailScore);
    if(analysis.tokens.length){var candidateTokens=productText.split(' ').map(tokenStem).filter(function(token){return token.length>1;}),importantHits=analysis.tokens.filter(function(token){return candidateTokens.some(function(candidate){return candidate===token||(candidate.length>2&&token.length>2&&(candidate.indexOf(token)===0||token.indexOf(candidate)===0));});}).length;score+=Math.min(220,importantHits*55);}
    if(queryFamily&&candidateFamily&&compatibleFamily(queryFamily,candidateFamily))score+=500;
    else if(queryFamily&&!candidateFamily)score=Math.max(0,score-220);
    var wantedClass=desiredProductClass(q);if(product.productClass===wantedClass)score+=80;else if(wantedClass==='individual'&&product.productClass==='set')score-=220;else if(wantedClass!=='kit'&&product.productClass==='kit')score-=320;
    score+=specificationScore(q,productText);
    if(criticalConflicts(q,productText).length)return 0;
    if(requestsElectricalInsulation(q)&&isElectricalInsulated(product))score+=260;
    if(product.productClass==='kit')product.kitContents.forEach(function(item){score=Math.max(score,textMatchScore([item.title,item.keywords,item.sku].join(' '),variants,640));});
    if(/\bcrimp(?:ers?|ing)?\b/.test(productText)&&!/\bcrimp(?:ers?|ing)?\b/.test(q))score=Math.max(0,score-180);
    if(/\bstorage\b/.test(title)&&q.indexOf('storage')===-1&&q!==id)score=Math.max(0,score-250);
    if(product.handle)score+=35;
    return Math.max(0,score);
  }
  function deterministicEvidence(query,product,rawScore){
    if(!product)return {confidence:0,status:'No match found',explanation:'No candidate passed the category and critical-specification checks.',conflicts:[]};
    if(skuKey(query)===skuKey(product.sku))return {confidence:100,status:'Exact match',explanation:'Exact TengTools item ID.',conflicts:[]};
    var analysis=analyzeInput(query),conflicts=criticalConflicts(query,product._searchText),familyAgreement=!!(analysis.family&&product._family&&analysis.family===product._family),familyCompatible=!!(analysis.family&&product._family&&compatibleFamily(analysis.family,product._family)),specs=specifications(query),specAgreement=!specs.length||specificationCompatible(query,product._searchText),score=Math.max(0,Math.min(100,Math.round((rawScore||0)/12)));
    if(familyAgreement)score+=12;else if(familyCompatible)score+=5;if(specs.length&&specAgreement)score+=12;if(productClassCompatible(query,product))score+=8;score=Math.min(99,score);if(!specs.length)score=Math.min(score,79);
    var status=conflicts.length?'Manual review required':score>=88&&familyAgreement&&specAgreement&&specs.length?'Exact match':score>=70?'Close alternative':'Multiple possible matches';
    var explanation=[familyAgreement?'Product category agrees.':familyCompatible?'Related product category.':'Product category is uncertain.',specs.length?(specAgreement?'Critical specifications agree.':'Critical specifications conflict.'):'No critical specification was supplied.'].concat(conflicts).join(' ');
    return {confidence:conflicts.length?Math.min(score,49):score,status:status,explanation:explanation,conflicts:conflicts};
  }
  function matchingKitContents(product,query){
    if(!product||product.productClass!=='kit')return[];var variants=queryVariants(query);
    return product.kitContents.filter(function(item){return textMatchScore([item.title,item.keywords,item.sku].join(' '),variants,640)>=400;});
  }
  function kitContentReason(product,query){
    var matches=matchingKitContents(product,query);if(!matches.length)return'';
    var examples=matches.slice(0,2).map(function(item){return item.title||item.sku;}).join('; '),more=matches.length>2?' +'+(matches.length-2)+' more':'';
    return 'Contains '+matches.length+' matching set'+(matches.length===1?'':'s')+': '+examples+more;
  }
  function terminologyReason(product,query){
    var q=clean(query),title=clean(product&&product.title);
    if(/\bspanners?\b/.test(q)&&/\bwrench(?:es)?\b/.test(title)&&!/\bspanners?\b/.test(title))return 'Terminology match: spanner and wrench are treated as equivalents.';
    if(/\bwrench(?:es)?\b/.test(q)&&/\bspanners?\b/.test(title)&&!/\bwrench(?:es)?\b/.test(title))return 'Terminology match: wrench and spanner are treated as equivalents.';
    if(/\ballen keys?\b/.test(q)&&/\bhex keys?\b/.test(title))return 'Terminology match: Allen key and hex key are treated as equivalents.';
    if(/\bhex keys?\b/.test(q)&&/\ballen keys?\b/.test(title))return 'Terminology match: hex key and Allen key are treated as equivalents.';
    if(/\bvde\b|\b1000\s*v(?:olt)?s?\b/.test(q)&&/\b(?:vde|insulated|1000\s*(?:v|volt)|iec\s*60900)\b/.test(product._searchText))return 'Specification match: VDE, IEC 60900 and 1,000 V insulated tools are treated as equivalents.';
    return'';
  }
  function selectedProductTypes(){return Array.from(document.querySelectorAll('#tt-match input[name="ttm-product-type"]:checked')).map(function(input){return input.value;});}
  function productClassLabel(value){return value==='kit'?'Complete kit':value==='set'?'Set':'Individual item';}
  function findProducts(query,limit,ignoreTypes){
    var selected=selectedProductTypes();
    var analysis=analyzeInput(query),pool=products;
    if(analysis.family){var related=[];Object.keys(productsByFamily).forEach(function(family){if(compatibleFamily(analysis.family,family))related=related.concat(productsByFamily[family]);});if(selected.indexOf('kit')!==-1)related=related.concat(products.filter(function(product){return product.productClass==='kit';}));if(related.length)pool=related.filter(function(product,index,array){return array.indexOf(product)===index;});}
    var found=pool.map(function(product){return {product:product,score:scoreProduct(product,query,analysis)};}).filter(function(x){return x.score>=200&&(ignoreTypes||selected.indexOf(x.product.productClass)!==-1);}).sort(function(a,b){return b.score-a.score||a.product.title.localeCompare(b.product.title);});
    return limit?found.slice(0,limit):found;
  }
  function imageMarkup(product){
    return product&&product.image?'<img class="ttm-product-image" src="'+esc(product.image)+'" alt="" loading="lazy" width="64" height="64">':'<span class="ttm-image-fallback" aria-hidden="true">NO IMAGE</span>';
  }
  function productLink(product){return product&&product.handle?'/products/'+encodeURIComponent(product.handle):'';}
  function leadingItemCode(value){var match=text(value).match(/^\s*([A-Z0-9][A-Z0-9._\/]{3,})\s*-\s*/i);return match?match[1]:'';}
  function groupedInput(unit,title){return /^(set|kit)$/i.test(text(unit))||(/\b\d+\s*(?:piece|pc)\b/i.test(text(title))&&/\b(?:set|kit)\b/i.test(text(title)));}
  function paginationItems(current,total){
    var pages=[];
    for(var page=1;page<=total;page++)if(page===1||page===total||Math.abs(page-current)<=1)pages.push(page);
    return pages.reduce(function(items,page,index){if(index&&page-pages[index-1]>1)items.push('ellipsis-'+page);items.push(page);return items;},[]);
  }
  function renderSuggestionPagination(total,page){
    var totalPages=Math.ceil(total/suggestionPageSize),start=((page-1)*suggestionPageSize)+1,end=Math.min(page*suggestionPageSize,total);
    if(totalPages<=1){els.pagination.hidden=true;els.pagination.innerHTML='';return;}
    var buttons=paginationItems(page,totalPages).map(function(item){
      if(typeof item==='string')return '<span class="ttm-page-ellipsis" aria-hidden="true">…</span>';
      return '<button class="ttm-page-button" type="button" data-suggestion-page="'+item+'"'+(item===page?' aria-current="page"':'')+' aria-label="Page '+item+'">'+item+'</button>';
    }).join('');
    els.pagination.innerHTML='<span class="ttm-pagination-summary">Showing '+start+'–'+end+' of '+total+'</span><div class="ttm-pagination-controls"><button class="ttm-page-button ttm-page-direction" type="button" data-suggestion-page="'+(page-1)+'"'+(page===1?' disabled':'')+'>'+icon('previous')+'Previous</button>'+buttons+'<button class="ttm-page-button ttm-page-direction" type="button" data-suggestion-page="'+(page+1)+'"'+(page===totalPages?' disabled':'')+'>Next'+icon('next')+'</button></div>';
    els.pagination.hidden=false;
  }
  function displaySuggestions(query,page,focusPage){
    var found=findProducts(query),total=found.length,totalPages=Math.max(1,Math.ceil(total/suggestionPageSize));suggestionPage=Math.min(Math.max(Number(page)||1,1),totalPages);els.suggestions.innerHTML='';
    if(!total){
      var excluded=findProducts(query,20,true),excludedClasses=excluded.map(function(item){return item.product.productClass;}).filter(function(value,index,array){return array.indexOf(value)===index&&selectedProductTypes().indexOf(value)===-1;});
      els.pagination.hidden=true;els.pagination.innerHTML='';
      els.suggestions.hidden=false;
      els.suggestions.innerHTML='<div class="ttm-suggestion ttm-suggestion--message"><div class="ttm-suggestion-copy"><strong>'+(excludedClasses.length?'Results are excluded by your product-type filters':'No TengTools product found')+'</strong><small>'+(excludedClasses.length?'Enable '+esc(excludedClasses.map(productClassLabel).join(' or '))+' above to include them.':(manualContext?'Try the detected tool name, a broader synonym or an item ID.':'Add this as a red review row so it can be matched manually or ignored.'))+'</small></div>'+(manualContext?'':'<button class="ttm-danger" type="button" data-add-unresolved="1">'+icon('plus')+'Add to review</button>')+'</div>';
      setStatus(excludedClasses.length?'Matching products exist outside the selected product types.':'No reliable result for “'+query+'”.','error');return;
    }
    found.slice((suggestionPage-1)*suggestionPageSize,suggestionPage*suggestionPageSize).forEach(function(item,index){
      var p=item.product,card=document.createElement('article');card.className='ttm-suggestion';
      var contentReason=kitContentReason(p,query),termReason=terminologyReason(p,query),capability=capabilityAssessment(query,p);
      card.innerHTML='<div class="ttm-suggestion-media">'+imageMarkup(p)+'</div><div class="ttm-suggestion-copy"><small>'+esc(productClassLabel(p.productClass))+(p.section?' · '+esc(p.section):'')+'</small><strong>'+esc(p.title)+'</strong><small>Item ID: '+esc(p.sku)+(p.unspsc?' · UNSPSC '+esc(p.unspsc):'')+'</small>'+(contentReason?'<small class="ttm-content-match">'+esc(contentReason)+'</small>':'')+(termReason?'<small class="ttm-content-match">'+esc(termReason)+'</small>':'')+(capability.warning?'<small class="ttm-content-match">Closest category candidate; review specifications. '+esc(capability.warning)+'</small>':'')+'</div><button class="ttm-primary" type="button" data-use-result="'+index+'">'+icon('check')+(manualContext?'Confirm match':'Use this match')+'</button>';
      card.querySelector('button')._match=p;els.suggestions.appendChild(card);
    });
    els.suggestions.hidden=false;renderSuggestionPagination(total,suggestionPage);setStatus(total+' TengTools result'+(total===1?'':'s')+' found. Select one to add it to the review table.','success');
    if(manualContext)setStatus(total+' relevant TengTools option'+(total===1?'':'s')+' found for '+(manualContext.component?'this component':'row '+(manualContext.row.sourceLine||manualContext.row.row))+'.','success');
    if(focusPage){var active=els.pagination.querySelector('[aria-current="page"]');if(active)active.focus();}
  }
  function rowFromInput(input){
    var brand=displayCase(input.inputBrand||input.brand),title=displayCase(input.inputTitle||input.description||input.title),id=text(input.inputId||input.itemId||input.sku)||leadingItemCode(title),qty=text(input.quantity||input.qty),unit=shortUnit(input.unit),sourceLine=text(input.sourceLine||input.lineNumber||input.line);
    var brandAllowsExact=!brand||/^(?:n a|not supplied|unknown)$/.test(clean(brand))||clean(brand).indexOf('teng')!==-1;
    var exact=id&&brandAllowsExact?productsBySku[skuKey(id)]||null:null;
    var matchQuery=title||id,suggestions=findProducts(matchQuery,12),automatic=exact||automaticCandidate(matchQuery,suggestions),candidate=automatic||reviewCandidate(matchQuery,suggestions);
    var confirmed=!!exact,capability=candidate?capabilityAssessment(matchQuery,candidate):null,identified=identifyRequestedItem(matchQuery),candidateItem=candidate?suggestions.find(function(item){return item.product===candidate;}):null,evidence=deterministicEvidence(matchQuery,candidate,candidateItem&&candidateItem.score),alternatives=suggestions.filter(function(item){return !candidate||item.product.sku!==candidate.sku;}).slice(0,3).map(function(item){return {sku:item.product.sku,title:item.product.title,confidence:deterministicEvidence(matchQuery,item.product,item.score).confidence};});
    var isGroup=groupedInput(unit,title);
    var detectedFamily=productFamily(matchQuery);
    return {row:nextRow++,sourceLine:sourceLine,inputBrand:brand||'N/A',inputId:id,inputTitle:title,quantity:qty,unit:unit,isGroup:isGroup,expanded:false,components:[],status:confirmed?'matched':'review',resultStatus:confirmed?'Exact match':evidence.status,confidenceScore:confirmed?100:evidence.confidence,matchExplanation:confirmed?'Exact TengTools item ID.':evidence.explanation,alternatives:alternatives,matchType:confirmed?'Exact TengTools item ID':(candidate?(capability&&!capability.safe?'Closest category alternative':'Suggested; confirmation required'):'No match'),tengSku:candidate?candidate.sku:'',tengTitle:candidate?candidate.title:'',tengImage:candidate?candidate.image:'',tengHandle:candidate?candidate.handle:'',productClass:candidate?candidate.productClass:'',unspsc:candidate?candidate.unspsc:'',unspscTitle:candidate?candidate.unspscTitle:'',unspscVersion:candidate?candidate.unspscVersion:'UNv260801',unspscConfidence:candidate?candidate.confidence:'',unspscReviewStatus:candidate?candidate.reviewStatus:'',unspscSource:candidate?candidate.unspscSource:'',detectedFamily:familyLabel(detectedFamily||(candidate&&candidate._family)),identifiedAs:identified.name,equivalence:capability?capability.equivalence:'',matchWarning:confirmed?'':(capability&&capability.warning||evidence.conflicts.join(' ')),category:categoryLabel(detectedFamily||(candidate&&candidate._family)),reason:isGroup?'Grouped line detected. Expand it to match the components individually.':(confirmed?'Exact TengTools item ID found':(candidate?(capability&&capability.warning?'Closest TengTools category candidate. '+capability.warning:'Relevant tool family detected; confirmation required.'):'No reliable automatic match found')),decision:confirmed?'Automatic match':'Needs review'};
  }
  function addRow(input){rows.push(rowFromInput(input));render();}
  function matchRow(row,product,manual){row.status='matched';row.resultStatus='Exact match';row.confidenceScore=100;row.matchExplanation=manual?'Confirmed by the logged-in reviewer.':'Selected from the TengTools catalogue.';row.matchWarning='';row.tengSku=product.sku;row.tengTitle=product.title;row.tengImage=product.image;row.tengHandle=product.handle;row.productClass=product.productClass;row.unspsc=product.unspsc;row.unspscTitle=product.unspscTitle;row.unspscVersion=product.unspscVersion||'UNv260801';row.unspscConfidence=product.confidence;row.unspscReviewStatus=product.reviewStatus;row.unspscSource=product.unspscSource||'';row.category=categoryLabel(productFamily(row.inputTitle||row.inputId)||product._family);row.matchType=manual?'Manual match':'Search selection';row.reason=manual?'Selected by logged-in user':'Selected from TengTools search';row.decision=manual?'Manually matched':'Confirmed';render();}
  function visibleRows(){
    var list=rows.filter(function(row){return activeFilter==='all'||row.status===activeFilter||(activeFilter==='matched'&&row.status==='matched');});
    return list.sort(function(a,b){var av=sortKey==='category'?(a.category||categoryLabel(productFamily(a.inputTitle))):a[sortKey],bv=sortKey==='category'?(b.category||categoryLabel(productFamily(b.inputTitle))):b[sortKey];if(sortKey==='row')return (av-bv)*sortDirection;return text(av).localeCompare(text(bv),undefined,{numeric:true,sensitivity:'base'})*sortDirection;});
  }
  function statusIndicator(kind,symbol,label){return '<span class="ttm-badge ttm-badge--'+kind+'" title="'+esc(label)+'" aria-label="'+esc(label)+'" tabindex="0">'+icon(symbol)+'<span class="ttm-visually-hidden">'+esc(label)+'</span></span>';}
  function badge(row){
    var outcome=row.status==='ignored'?'Ignored':(row.resultStatus||((row.status==='matched')?'Exact match':'Manual review required')),confidence=Number(row.confidenceScore),label=outcome+(row.status!=='ignored'&&isFinite(confidence)?' · '+confidence+'% confidence':'')+(row.matchWarning?' · '+row.matchWarning:'')+(row.matchExplanation?' · '+row.matchExplanation:''),kind=row.status==='matched'?'matched':row.status==='ignored'?'ignored':'review',symbol=row.status==='matched'?'confirmed':row.status==='ignored'?'ignore':'warning',indicators=[statusIndicator(kind,symbol,label)],duplicates=duplicateCount(row);
    if(duplicates>1)indicators.push(statusIndicator('warning','duplicate','Possible duplicate · '+duplicates+' identical lines'));
    if(row.tengSku&&!row.unspsc)indicators.push(statusIndicator('warning','tag','UNSPSC missing · confirm before export'));
    else if(row.unspscSource==='category')indicators.push(statusIndicator('info','info','UNSPSC category-derived · confirm before export'));
    if(row.isGroup)indicators.push(statusIndicator('info','parts','Grouped line · review each component'));
    return '<span class="ttm-status-indicators" role="group" aria-label="Status and warnings">'+indicators.join('')+'</span>';
  }
  function mobileSummary(row,duplicates){
    var kind=row.status==='matched'?'matched':row.status==='ignored'?'ignored':'review',symbol=row.status==='matched'?'confirmed':row.status==='ignored'?'ignore':'warning';
    var label=row.status==='matched'?'Matched':row.status==='ignored'?'Ignored':'Review required';
    var meta=[row.inputId&&row.inputId!=='N/A'?row.inputId:'',row.category||'N/A',row.tengSku?'Teng '+row.tengSku:'No Teng match'].filter(Boolean).join(' · ');
    if(duplicates>1)label+=' · Possible duplicate';
    return '<td class="ttm-mobile-summary-cell"><button class="ttm-mobile-summary" type="button" data-action="toggle-mobile" aria-expanded="false"><span class="ttm-mobile-row-number">Row '+esc(row.sourceLine||row.row)+'</span><span class="ttm-mobile-item">'+esc(row.inputTitle||row.inputId||'Untitled item')+'</span><span class="ttm-mobile-state ttm-mobile-state--'+kind+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+icon(symbol)+'</span><span class="ttm-mobile-meta">'+esc(meta)+'</span><span class="ttm-mobile-arrow" aria-hidden="true">'+icon('expand')+'</span></button></td>';
  }
  function updateGroupStatus(row){
    if(!row.isGroup||!row.components||!row.components.length)return;
    var complete=row.components.every(function(component){return component.status==='matched'||component.status==='ignored';});
    row.status=complete?'matched':'review';row.matchType=complete?'Component breakdown':'Grouped line';row.decision=complete?'All components reviewed':'Needs component review';row.reason=complete?'Every component has been matched or ignored.':'One or more components still need review.';
  }
  function componentFromInput(description,quantity){
    var suggestions=findProducts(description,12),candidate=automaticCandidate(description,suggestions);
    return {id:'c'+Date.now()+Math.random().toString(36).slice(2,7),description:text(description),quantity:text(quantity)||'1',status:'review',tengSku:candidate?candidate.sku:'',tengTitle:candidate?candidate.title:'',tengImage:candidate?candidate.image:'',tengHandle:candidate?candidate.handle:'',productClass:candidate?candidate.productClass:'',unspsc:candidate?candidate.unspsc:'',unspscTitle:candidate?candidate.unspscTitle:'',unspscSource:candidate?candidate.unspscSource:'',category:categoryLabel(productFamily(description)),reason:candidate?'Possible title match. Confirm it manually.':'No reliable automatic match found'};
  }
  function persistRows(){
    if(!storageReady)return;
    try{
      if(rows.length)localStorage.setItem(storageKey,JSON.stringify({rows:rows,nextRow:nextRow,matcherVersion:savedMatcherVersion||(catalogReady?MATCHER_VERSION:0),sourceFile:sourceFileName,savedAt:new Date().toISOString()}));else localStorage.removeItem(storageKey);
      els.saveState.textContent='Your working table is kept on this device until you choose Save session.';
    }catch(error){els.saveState.textContent='Automatic saving is unavailable in this browser';}
  }
  function normalizeRestoredRows(list){
    return (Array.isArray(list)?list:[]).map(function(row){
      row.inputBrand=displayCase(row.inputBrand);
      row.inputTitle=displayCase(row.inputTitle);
      row.unit=shortUnit(row.unit);
      if(Array.isArray(row.components))row.components.forEach(function(component){component.description=displayCase(component.description);});
      return row;
    });
  }
  function restoreSavedRows(){
    try{
      var saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved&&Array.isArray(saved.rows)){rows=normalizeRestoredRows(saved.rows);savedMatcherVersion=Number(saved.matcherVersion)||0;sourceFileName=text(saved.sourceFile);nextRow=Math.max(Number(saved.nextRow)||1,rows.reduce(function(max,row){return Math.max(max,Number(row.row)||0);},0)+1);}
    }catch(error){localStorage.removeItem(storageKey);}
    storageReady=true;
  }

  function sessionEndpoint(params){
    var url=new URL(sessionApiUrl,location.origin);Object.keys(params||{}).forEach(function(key){if(params[key]!==undefined&&params[key]!==null&&params[key]!=='')url.searchParams.set(key,params[key]);});return url.toString();
  }
  async function sessionRequest(params,options){
    if(!sessionApiUrl)throw new Error('Saved sessions are not available yet.');var response=await fetch(sessionEndpoint(params),Object.assign({credentials:'same-origin',headers:{'Accept':'application/json'}},options||{})),payload={};try{payload=await response.json();}catch(error){}if(!response.ok)throw new Error(payload.error||'The saved session service is unavailable.');return payload;
  }
  function sessionDefaultName(){var base=sourceFileName.replace(/\.[^.]+$/,'').trim();return currentSessionName||base||('Matching session '+new Date().toLocaleDateString('en-ZA'));}
  function openSaveDialog(){if(!rows.length)return;els.sessionName.value=sessionDefaultName();els.sessionStatus.value=rows.some(function(row){return row.status==='review';})?'In progress':'Ready';els.saveDialog.showModal();setTimeout(function(){els.sessionName.focus();els.sessionName.select();},30);}
  async function saveCloudSession(){
    var submit=els.saveForm.querySelector('[type="submit"]'),name=text(els.sessionName.value);if(!name){els.sessionName.focus();return;}submit.disabled=true;submit.innerHTML=icon('restore')+'Saving…';
    try{var payload=await sessionRequest({}, {method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({action:'save',session:{id:currentSessionHandle||undefined,name:name,status:els.sessionStatus.value,payload:{rows:rows,nextRow:nextRow,matcherVersion:MATCHER_VERSION,sourceFile:sourceFileName}}})});currentSessionHandle=payload.session.handle;currentSessionName=payload.session.name;var currentUrl=new URL(location.href);currentUrl.searchParams.set('session',currentSessionHandle);history.replaceState(null,'',currentUrl);els.saveDialog.close();els.saveState.textContent='Saved securely to Shopify as “'+currentSessionName+'”.';setStatus('Session saved. TengTools sales representatives can now open it from this Shopify customer account.','success');}
    catch(error){setStatus(error.message||'The session could not be saved.','error');}
    finally{submit.disabled=false;submit.innerHTML=icon('check')+'Save session';}
  }
  function sessionListMarkup(sessions){
    if(!sessions.length)return '<div class="ttm-session-empty">No saved sessions yet.</div>';return sessions.map(function(session){var when=new Date(session.savedAt||session.updatedAt),date=isNaN(when.getTime())?'':when.toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'});return '<button class="ttm-session-item" type="button" data-load-session="'+esc(session.handle)+'"><span><strong>'+esc(session.name)+'</strong><small>'+esc(session.matchedCount)+' matched · '+esc(session.reviewCount)+' need review · '+esc(session.rowCount)+' rows'+(date?' · '+esc(date):'')+'</small></span>'+icon('next')+'</button>';}).join('');
  }
  async function openSessionLibrary(){els.sessionList.innerHTML='<div class="ttm-session-empty">Loading saved sessions…</div>';els.sessionsDialog.showModal();try{var payload=await sessionRequest({action:'list'});els.sessionList.innerHTML=sessionListMarkup(payload.sessions||[]);}catch(error){els.sessionList.innerHTML='<div class="ttm-session-empty">'+esc(error.message||'Saved sessions could not be loaded.')+'</div>';}}
  async function loadCloudSession(handle){
    setStatus('Opening saved session…');try{var payload=await sessionRequest({action:'load',id:handle}),session=payload.session,data=session.payload||{};rows=normalizeRestoredRows(data.rows);nextRow=Math.max(Number(data.nextRow)||1,rows.reduce(function(max,row){return Math.max(max,Number(row.row)||0);},0)+1);savedMatcherVersion=Number(data.matcherVersion)||0;sourceFileName=text(data.sourceFile||session.sourceFile);currentSessionHandle=session.handle;currentSessionName=session.name;render();if(catalogReady)await revalidateRestoredRows();els.saveState.textContent='Opened Shopify session “'+currentSessionName+'”.';setStatus('Saved session opened. Changes remain local until you choose Save session.','success');return true;}catch(error){setStatus(error.message||'The saved session could not be opened.','error');return false;}
  }
  function applyCandidateToReviewItem(item,query){
    var suggestions=findProducts(query,12),candidate=automaticCandidate(query,suggestions)||reviewCandidate(query,suggestions);
    item.tengSku=candidate?candidate.sku:'';item.tengTitle=candidate?candidate.title:'';item.tengImage=candidate?candidate.image:'';item.tengHandle=candidate?candidate.handle:'';item.productClass=candidate?candidate.productClass:'';item.unspsc=candidate?candidate.unspsc:'';item.unspscTitle=candidate?candidate.unspscTitle:'';item.unspscVersion=candidate?(candidate.unspscVersion||'UNv260801'):'UNv260801';item.unspscConfidence=candidate?candidate.confidence:'';item.unspscReviewStatus=candidate?candidate.reviewStatus:'';item.unspscSource=candidate?candidate.unspscSource:'';item.category=categoryLabel(productFamily(query));
    item.matchType=candidate?'Suggested; confirmation required':'No match';
    item.detectedFamily=familyLabel(productFamily(query));item.reason=candidate?'Relevant tool family detected; confirmation required.':'No reliable automatic match found';
    item.decision='Needs review';
  }
  function refreshMatchedMetadata(item,query){
    if(!item.tengSku)return false;var product=productsBySku[skuKey(item.tengSku)];if(!product)return false;
    var changed=item.unspsc!==product.unspsc||item.tengTitle!==product.title||item.tengHandle!==product.handle;
    item.tengTitle=product.title;item.tengImage=product.image;item.tengHandle=product.handle;item.productClass=product.productClass;item.unspsc=product.unspsc;item.unspscTitle=product.unspscTitle;item.unspscVersion=product.unspscVersion||'UNv260801';item.unspscConfidence=product.confidence;item.unspscReviewStatus=product.reviewStatus;item.unspscSource=product.unspscSource||'';item.category=categoryLabel(productFamily(query)||product._family);return changed;
  }
  async function revalidateRestoredRows(){
    if(!rows.length||!products.length||savedMatcherVersion===MATCHER_VERSION)return false;
    setStatus('Your saved review is available. Updating its matches in the background…');
    var changed=false;
    for(var start=0;start<rows.length;start+=6){
      rows.slice(start,start+6).forEach(function(row){
        row.inputBrand=!text(row.inputBrand)||text(row.inputBrand)==='Not supplied'?'N/A':row.inputBrand;
        row.category=row.category||categoryLabel(productFamily(row.inputTitle||row.inputId));
        if(row.tengSku)changed=refreshMatchedMetadata(row,text(row.inputTitle)||text(row.inputId))||changed;
        if(row.status==='review'){
          applyCandidateToReviewItem(row,text(row.inputTitle)||text(row.inputId));
          if(row.isGroup)row.reason='Grouped line detected. Expand it to match the components individually.';
        }
        (row.components||[]).forEach(function(component){component.category=component.category||categoryLabel(productFamily(component.description));if(component.tengSku)changed=refreshMatchedMetadata(component,text(component.description))||changed;if(component.status==='review')applyCandidateToReviewItem(component,text(component.description));});
        updateGroupStatus(row);
      });
      await nextFrame();
    }
    savedMatcherVersion=MATCHER_VERSION;render();return true;
  }
  function updateSortIndicators(){
    document.querySelectorAll('#tt-match [data-sort]').forEach(function(button){
      if(!button.dataset.sortLabel)button.dataset.sortLabel=button.textContent.replace(/[↑↓]\s*$/,'').trim();
      var active=button.dataset.sort===sortKey,th=button.closest('th');
      button.innerHTML='<span>'+esc(button.dataset.sortLabel)+'</span><span class="ttm-sort-icon" aria-hidden="true">'+(active?(sortDirection===1?'↑':'↓'):'↕')+'</span>';
      if(th){if(active)th.setAttribute('aria-sort',sortDirection===1?'ascending':'descending');else th.removeAttribute('aria-sort');}
    });
  }
  function loadColumnOrder(){try{var saved=JSON.parse(localStorage.getItem(storageKey+'-columns')||'null'),widths=JSON.parse(localStorage.getItem(storageKey+'-column-widths')||'{}'),shown=JSON.parse(localStorage.getItem(storageKey+'-visible-columns')||'null');if(Array.isArray(saved)){var retained=saved.filter(function(key){return baseColumns.indexOf(key)!==-1;}),added=baseColumns.filter(function(key){return retained.indexOf(key)===-1;});columnOrder=retained.concat(added);}if(Array.isArray(shown)){visibleColumns=shown.filter(function(key){return baseColumns.indexOf(key)!==-1;});if(!visibleColumns.length)visibleColumns=baseColumns.slice();}if(widths&&typeof widths==='object')columnWidths=widths;}catch(error){columnOrder=baseColumns.slice();visibleColumns=baseColumns.slice();columnWidths={};}}
  function saveColumnOrder(){try{localStorage.setItem(storageKey+'-columns',JSON.stringify(columnOrder));}catch(error){}}
  function saveColumnWidths(){try{localStorage.setItem(storageKey+'-column-widths',JSON.stringify(columnWidths));}catch(error){}}
  function saveVisibleColumns(){try{localStorage.setItem(storageKey+'-visible-columns',JSON.stringify(visibleColumns));}catch(error){}}
  function applyColumnOrderToRow(tr){columnOrder.forEach(function(key){var cell=tr.querySelector('[data-column="'+key+'"]');if(cell)tr.appendChild(cell);});}
  function minimumColumnWidth(key){return columnMinWidths[key]||54;}
  function applyColumnWidths(){document.querySelectorAll('#tt-match thead th[data-column]').forEach(function(th){var key=th.dataset.column,width=Number(columnWidths[key]);if(width){width=Math.max(minimumColumnWidth(key),width);columnWidths[key]=width;th.style.width=width+'px';}else th.style.width='';});}
  function applyColumnVisibility(){document.querySelectorAll('#tt-match [data-column]').forEach(function(cell){cell.hidden=visibleColumns.indexOf(cell.dataset.column)===-1;});document.querySelectorAll('#tt-match .ttm-group-detail td').forEach(function(cell){cell.colSpan=visibleColumns.length;});}
  function renderColumnOptions(){if(!els.columnOptions)return;els.columnOptions.innerHTML=columnOrder.map(function(key){return '<label class="ttm-column-option"><input type="checkbox" value="'+esc(key)+'" '+(visibleColumns.indexOf(key)!==-1?'checked':'')+'><span>'+esc(columnLabels[key]||key)+'</span></label>';}).join('');}
  function applyColumnOrderToHeader(){var row=document.querySelector('#tt-match thead tr');if(!row)return;applyColumnOrderToRow(row);applyColumnWidths();applyColumnVisibility();renderColumnOptions();}
  function updateCounts(){
    $('ttm-total').textContent=rows.length+' row'+(rows.length===1?'':'s');$('ttm-matched').textContent=rows.filter(function(r){return r.status==='matched';}).length+' matched';$('ttm-review').textContent=rows.filter(function(r){return r.status==='review';}).length+' need review';$('ttm-ignored').textContent=rows.filter(function(r){return r.status==='ignored';}).length+' ignored';els.download.disabled=rows.length===0;els.clearSaved.disabled=rows.length===0;els.saveSession.disabled=rows.length===0;
  }
  function componentBadge(component){return badge(component);}
  function duplicateCount(row){var key=clean(row.inputTitle);return key?rows.filter(function(other){return clean(other.inputTitle)===key;}).length:1;}
  function groupMarkup(row){
    var components=(row.components||[]).map(function(component,index){
      var product={sku:component.tengSku,title:component.tengTitle,image:component.tengImage,handle:component.tengHandle,productClass:component.productClass};
      var link=productLink(product),recommendation=component.tengSku?'<div class="ttm-component-product">'+imageMarkup(product)+'<span><strong>'+esc(component.tengSku)+'</strong><br>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener">'+esc(component.tengTitle)+'</a>':esc(component.tengTitle)+'<small>Product page unavailable</small>')+'</span></div>':'<span class="ttm-muted">No TengTools item confirmed</span>';
      return '<div class="ttm-component" data-component="'+esc(component.id)+'"><div><span class="ttm-component-number">'+(index+1)+'</span><strong>'+esc(component.description)+'</strong><small>Qty per set: '+esc(component.quantity)+'</small></div><div>'+componentBadge(component)+'</div><div>'+recommendation+'</div><div class="ttm-component-actions">'+(component.status==='ignored'?'<button class="ttm-quiet" type="button" data-component-action="restore">'+icon('restore')+'Restore</button>':'<button class="ttm-danger" type="button" data-component-action="ignore">'+icon('ignore')+'Ignore</button>')+'<button class="ttm-secondary" type="button" data-component-action="manual">'+icon('search')+'Match manually</button><button class="ttm-delete" type="button" data-component-action="delete">'+icon('trash')+'Delete</button></div></div>';
    }).join('');
    return '<section class="ttm-group-panel" aria-label="Component breakdown"><div class="ttm-group-heading"><div><strong>'+icon('parts')+'Component breakdown</strong><p>Keep the original RFQ line together, but match every tool inside it separately.</p></div><span>'+row.components.length+' component'+(row.components.length===1?'':'s')+'</span></div>'+(components||'<p class="ttm-group-empty">No components added yet. Add only the items that are actually required—nothing is inferred from a size range.</p>')+'<form class="ttm-component-form" data-component-form><label>Component description<input name="description" required placeholder="e.g. 10 mm combination spanner"></label><label>Qty per set<input name="quantity" type="number" min="0.01" step="any" value="1" required></label><button class="ttm-primary" type="submit">'+icon('plus')+'Add component</button></form></section>';
  }
  function render(){
    var list=visibleRows(),duplicateMap={};rows.forEach(function(item){var key=clean(item.inputTitle);if(key)duplicateMap[key]=(duplicateMap[key]||0)+1;});els.body.innerHTML='';els.empty.hidden=rows.length>0;els.download.disabled=rows.length===0;els.clearSaved.disabled=rows.length===0;
    list.forEach(function(row){
      if(row.components===undefined)row.components=[];if(row.isGroup===undefined)row.isGroup=groupedInput(row.unit,row.inputTitle);if(!row.category)row.category=categoryLabel(productFamily(row.inputTitle||row.inputId));
      if(row.inputBrand==='Not supplied')row.inputBrand='N/A';
      var tr=document.createElement('tr'),product={sku:row.tengSku,title:row.tengTitle,image:row.tengImage,handle:row.tengHandle,productClass:row.productClass};tr.className=row.status==='review'?'is-review':row.status==='ignored'?'is-ignored':'is-matched';tr.dataset.row=row.row;
      var recommendation=row.tengSku?'<div class="ttm-product-cell">'+imageMarkup(product)+'<div class="ttm-product-title">'+(productLink(product)?'<a href="'+esc(productLink(product))+'" target="_blank" rel="noopener">'+esc(row.tengTitle)+'</a>':esc(row.tengTitle)+'<small>Product page unavailable</small>')+'<small>'+esc(productClassLabel(row.productClass))+'</small></div></div>':'—';
      var duplicates=duplicateMap[clean(row.inputTitle)]||1;
      var actionItems=(row.status==='ignored'?'<button type="button" data-action="restore">'+icon('restore')+'Restore</button>':'<button type="button" data-action="ignore">'+icon('ignore')+'Ignore</button>')+'<button type="button" data-action="manual">'+icon('search')+'Find match</button><button class="ttm-delete" type="button" data-action="delete">'+icon('trash')+'Delete</button>';
      var unspscMeta=row.unspscSource==='category'?'Category-derived · confirm before export':([row.unspscTitle,row.unspscConfidence?row.unspscConfidence+' confidence':''].filter(Boolean).join(' · '));
      tr.innerHTML=mobileSummary(row,duplicates)+'<td data-column="row" data-label="Row"><strong>'+(row.sourceLine?esc(row.sourceLine):row.row)+'</strong></td><td data-column="inputBrand" data-label="Brand">'+esc(row.inputBrand)+'</td><td data-column="inputId" data-label="Item ID" class="ttm-sku">'+esc(row.inputId||'—')+'</td><td data-column="inputTitle" data-label="Description">'+esc(row.inputTitle||'—')+(row.isGroup?'<br><button class="ttm-group-toggle" type="button" data-action="toggle-group" aria-expanded="'+(row.expanded?'true':'false')+'">'+icon(row.expanded?'collapse':'expand')+(row.expanded?'Hide':'Match')+' components</button>':'')+'</td><td data-column="quantity" data-label="Qty" class="ttm-number">'+esc(row.quantity||'—')+'</td><td data-column="unit" data-label="Unit">'+esc(row.unit||'—')+'</td><td data-column="status" data-label="Status">'+badge(row)+'</td><td data-column="category" data-label="Category"><span class="ttm-category-tag">'+esc(row.category||'N/A')+'</span></td><td data-column="tengSku" data-label="Teng ID" class="ttm-sku">'+esc(row.tengSku||'—')+'</td><td data-column="tengTitle" data-label="Teng match">'+recommendation+'</td><td data-column="unspsc" data-label="UNSPSC">'+(row.unspsc?'<span class="ttm-sku">'+esc(row.unspsc)+'</span>'+(unspscMeta?'<br><small>'+esc(unspscMeta)+'</small>':''):'—')+'</td><td data-column="actions" data-label="Actions"><details class="ttm-action-menu"><summary>Action '+icon('expand')+'</summary><div class="ttm-action-list">'+actionItems+'</div></details></td>';
      applyColumnOrderToRow(tr);
      els.body.appendChild(tr);
      if(row.isGroup&&row.expanded){var detail=document.createElement('tr');detail.className='ttm-group-detail';detail.dataset.row=row.row;detail.innerHTML='<td colspan="'+visibleColumns.length+'">'+groupMarkup(row)+'</td>';els.body.appendChild(detail);}
    });
    applyColumnVisibility();updateCounts();updateSortIndicators();persistRows();
  }
  function deleteRowWithUndo(tr,row){
    var originalIndex=rows.indexOf(row),seconds=5,key=String(row.row);rows.splice(originalIndex,1);updateCounts();persistRows();
    tr.className='ttm-undo-row';tr.innerHTML='<td colspan="'+visibleColumns.length+'"><div class="ttm-undo" role="status"><strong>Row '+(row.sourceLine||row.row)+' deleted.</strong><button class="ttm-secondary" type="button" data-undo-delete="'+esc(key)+'">'+icon('restore')+'Undo</button><span class="ttm-undo-countdown">5s</span></div></td>';
    var countdown=tr.querySelector('.ttm-undo-countdown'),timer=setInterval(function(){seconds-=1;if(seconds>0){if(countdown)countdown.textContent=seconds+'s';return;}clearInterval(timer);delete pendingDeletes[key];if(tr.isConnected)tr.remove();},1000);
    pendingDeletes[key]={row:row,index:originalIndex,timer:timer,tr:tr};setStatus('Row '+row.row+' was deleted. Undo is available for 5 seconds.','success');tr.querySelector('[data-undo-delete]').focus();
  }
  function undoDelete(key){
    var pending=pendingDeletes[key];if(!pending)return;clearInterval(pending.timer);delete pendingDeletes[key];rows.splice(Math.min(pending.index,rows.length),0,pending.row);render();setStatus('Row '+pending.row.row+' was restored.','success');var restored=els.body.querySelector('tr[data-row="'+pending.row.row+'"]');if(restored){var button=restored.querySelector('[data-action="delete"]');if(button)button.focus();}
  }
  function openManual(row,component){
    var description=component?component.description:(row.inputTitle||row.inputId||''),label='Row '+(row.sourceLine||row.row)+(row.inputId?' · Item '+row.inputId:'');
    manualContext={row:row,component:component||null,previousQuery:els.query.value};
    els.searchPanel.classList.add('is-manual-matching');els.manualBanner.hidden=false;els.manualLabel.innerHTML='<strong>'+esc(component?'Manually matching a component':'Manually matching '+label)+'</strong><span>'+esc(description)+(row.detectedFamily?' · Detected tool: '+esc(row.detectedFamily):'')+'</span>';
    els.startTitle.textContent=component?'Choose a TengTools product for this component':'Choose a TengTools product for '+label;
    els.startIntro.textContent='Search the full TengTools range below. Select Confirm match on the correct product, or cancel without changing the row.';
    els.query.value=searchSeed(description);displaySuggestions(els.query.value,1);els.searchPanel.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(function(){els.query.focus();els.query.select();},450);
  }
  function cancelManual(message){
    if(!manualContext)return;var previous=manualContext.previousQuery;manualContext=null;els.searchPanel.classList.remove('is-manual-matching');els.manualBanner.hidden=true;els.startTitle.textContent='What do you need to match?';els.startIntro.textContent='Enter a tool name or item ID, or upload an existing stock list. Nothing is priced or ordered here.';els.suggestions.hidden=true;els.pagination.hidden=true;els.query.value=previous||'';setStatus(message||'Manual matching cancelled. No changes were made.');
  }
  function normalizedHeader(value){return clean(value).replace(/ /g,'');}
  function rowsFromGrid(grid){
    if(!grid||!grid.length)return[];var first=grid[0].map(normalizedHeader),known=first.some(function(h){return /brand|sku|item|part|description|product|quantity|qty/.test(h);});var start=known?1:0;
    function col(patterns){for(var i=0;i<first.length;i++)for(var j=0;j<patterns.length;j++)if(first[i].indexOf(patterns[j])!==-1)return i;return-1;}
    var bi=col(['brand','manufacturer','make']),ii=col(['itemid','itemnumber','partnumber','partno','sku','code']),di=col(['description','producttitle','productname','itemdescription','toolname','name']),qi=col(['quantity','qty']),ui=col(['unit','uom','unitofmeasure']),li=col(['line#','linenumber','lineno','line']);
    return grid.slice(start).map(function(line){var joined=line.map(text).filter(Boolean);if(!joined.length)return null;var description=text(di>=0?line[di]:(known?'':line.slice(1).join(' '))),itemId=text(ii>=0?line[ii]:(known?leadingItemCode(description):line[0]));if(!description&&!itemId)return null;return {sourceLine:li>=0?line[li]:'',brand:bi>=0?line[bi]:'',itemId:itemId,description:description,quantity:qi>=0?line[qi]:'',unit:ui>=0?line[ui]:''};}).filter(Boolean);
  }
  function parseCsv(data){var out=[],row=[],cell='',quoted=false;for(var i=0;i<data.length;i++){var c=data[i],n=data[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++;}else if(c==='"'){quoted=!quoted;}else if((c===','||c===';'||c==='\t')&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);out.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);out.push(row);}return out;}
  function aiCandidatePayload(product){return {sku:product.sku,title:product.title,family:product._family,productClass:product.productClass,description:product.description,keywords:product.keywords};}
  function aiCandidateShortlist(row,assessment){
    var original=row.inputTitle||row.inputId,queries=[original],identified=text(assessment&&assessment.identifiedAs),family=text(assessment&&assessment.toolFamily);
    if(identified)queries.push(identified);if(family)queries.push(family);if(identified&&family)queries.push(identified+' '+family);
    var seen={},list=[];queries.forEach(function(query){findProducts(query,12,true).forEach(function(item){var key=skuKey(item.product.sku);if(!seen[key]){seen[key]=true;list.push(item.product);}});});
    return list.slice(0,12);
  }
  function aiInputPayload(row,assessment){
    return {row:row.row,input:row.inputTitle||row.inputId,brand:row.inputBrand,itemId:row.inputId,preliminaryIdentification:text(assessment&&assessment.identifiedAs),preliminaryToolFamily:text(assessment&&assessment.toolFamily),candidates:aiCandidateShortlist(row,assessment).map(aiCandidatePayload)};
  }
  function clearSuggestedProduct(row){row.tengSku='';row.tengTitle='';row.tengImage='';row.tengHandle='';row.productClass='';row.unspsc='';row.unspscTitle='';row.unspscConfidence='';row.unspscReviewStatus='';row.unspscSource='';}
  function applyAiAssessment(row,assessment){
    row.identifiedAs=text(assessment.identifiedAs)||row.identifiedAs;row.equivalence=text(assessment.equivalence);row.aiConfidence=text(assessment.confidence);row.aiSources=Array.isArray(assessment.sources)?assessment.sources:[];row.setOutcome=text(assessment.setOutcome);row.setResearchSource=text(assessment.competitorSetSource);row.setResearchDate=text(assessment.sourceAccessedAt);row.confidenceScore=assessment.confidence==='high'?90:assessment.confidence==='medium'?65:35;row.resultStatus=assessment.equivalence==='equivalent'?(assessment.requiresReview?'Close alternative':'Exact match'):assessment.equivalence==='closest-alternative'?'Close alternative':'No match found';
    var query=row.inputTitle||row.inputId,candidate=assessment.candidateSku?productsBySku[skuKey(assessment.candidateSku)]:null,classMismatch=!!(candidate&&!productClassCompatible(query,candidate));
    if(classMismatch)candidate=null;
    if(candidate){row.tengSku=candidate.sku;row.tengTitle=candidate.title;row.tengImage=candidate.image;row.tengHandle=candidate.handle;row.productClass=candidate.productClass;row.unspsc=candidate.unspsc;row.unspscTitle=candidate.unspscTitle;row.unspscVersion=candidate.unspscVersion||'UNv260801';row.unspscConfidence=candidate.confidence;row.unspscReviewStatus=candidate.reviewStatus;row.unspscSource=candidate.unspscSource||'';}
    else if(assessment.equivalence==='no-equivalent'||assessment.candidateSku)clearSuggestedProduct(row);
    var identifiedFamily=productFamily([assessment.identifiedAs,assessment.toolFamily,row.inputTitle].join(' '));if(identifiedFamily){row.detectedFamily=familyLabel(identifiedFamily);row.category=categoryLabel(identifiedFamily);}
    var queryFamily=identifiedFamily||productFamily(query),localSafe=!!(candidate&&productClassCompatible(query,candidate)&&queryFamily&&candidate._family&&compatibleFamily(queryFamily,candidate._family)&&!criticalConflicts(query,candidate._searchText).length&&capabilityAssessment(query,candidate).safe&&specificationCompatible(query,candidate._searchText));
    var documented=Array.isArray(assessment.documentedComponents)?assessment.documentedComponents:[];
    var tengIdentityConflict=!!(candidate&&row.inputId&&clean(row.inputBrand).indexOf('teng')!==-1&&skuKey(candidate.sku)!==skuKey(row.inputId));
    var autoConfirmed=!!(candidate&&!tengIdentityConflict&&!documented.length&&assessment.setOutcome!=='component-alternative'&&assessment.setOutcome!=='incomplete'&&assessment.equivalence==='equivalent'&&assessment.confidence==='high'&&!assessment.requiresReview&&localSafe);
    if(row.isGroup&&documented.length&&(!row.components||!row.components.length)){row.components=documented.map(function(component){var item=componentFromInput(component.description,component.quantity);item.evidence=text(component.evidence);return item;});row.expanded=true;row.resultStatus='Component match';row.status='review';}
    row.status=autoConfirmed?'matched':'review';row.matchType=autoConfirmed?'Verified equivalent':assessment.setOutcome==='component-alternative'?'Component-by-component alternative':assessment.equivalence==='closest-alternative'?'Closest alternative':assessment.equivalence==='equivalent'?'Suggested equivalent':'No safe equivalent';row.reason=text(assessment.reason)||row.reason;row.matchExplanation=row.reason;row.matchWarning=tengIdentityConflict?'The supplied TengTools item ID does not exactly match this product. Verify the item ID before selection.':classMismatch?'The suggested product type does not match the requested individual, set or kit.':((Array.isArray(assessment.warnings)?assessment.warnings.map(text).filter(Boolean).join(' '):'')||(assessment.requiresReview?'Review required':''));row.decision=autoConfirmed?'Automatic match':'Needs review';
  }
  async function aiReviewRows(imported,job){
    if(!sessionApiUrl)return {used:false,reviewed:0};
    var targets=imported.filter(function(row){return row.status==='review'&&(row.inputTitle||row.inputId);}),reviewedRows={};
    if(!targets.length)return {used:false,reviewed:0};
    for(var start=0;start<targets.length;start+=30){
      if(job.cancelled)throw new Error('cancelled');var batch=targets.slice(start,start+30);setUploadProgress(job,83+(start/targets.length)*15,'Identifying and reviewing row '+(start+1)+' of '+targets.length+'…');
      var result;
      try{result=await sessionRequest({}, {method:'POST',signal:job.controller.signal,headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({action:'analyze',items:batch.map(aiInputPayload)})});}
      catch(error){if(job.cancelled||error.name==='AbortError')throw new Error('cancelled');return {used:false,reviewed:Object.keys(reviewedRows).length,error:error};}
      var assessments=result.matches||[],refine=[];assessments.forEach(function(assessment){var row=batch.find(function(item){return Number(item.row)===Number(assessment.row);});if(!row)return;applyAiAssessment(row,assessment);reviewedRows[row.row]=true;if(!assessment.candidateSku||assessment.equivalence==='no-equivalent'||assessment.confidence==='low')refine.push({row:row,assessment:assessment});});
      if(refine.length){setUploadProgress(job,86+(start/targets.length)*12,'Checking refined TengTools candidates…');var refinedResult;try{refinedResult=await sessionRequest({}, {method:'POST',signal:job.controller.signal,headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({action:'analyze',items:refine.map(function(item){return aiInputPayload(item.row,item.assessment);})})});}catch(error){if(job.cancelled||error.name==='AbortError')throw new Error('cancelled');refinedResult={matches:[]};}(refinedResult.matches||[]).forEach(function(assessment){var item=refine.find(function(entry){return Number(entry.row.row)===Number(assessment.row);});if(item)applyAiAssessment(item.row,assessment);});}
      await nextFrame();
    }
    return {used:true,reviewed:Object.keys(reviewedRows).length};
  }
  async function importInputs(inputs,fileName,job){var imported=[];
    for(var i=0;i<inputs.length;i++){if(job.cancelled)return null;imported.push(rowFromInput(inputs[i]));if(i%50===0){setUploadProgress(job,72+(i/inputs.length)*10,'Matching row '+(i+1)+' of '+inputs.length+'…');await nextFrame();}}
    if(job.cancelled)return null;return imported;
  }
  function pdfVisualLines(items,pageNo){
    var positioned=items.map(function(item){return {text:text(item.str).replace(/\s+/g,' '),x:Number(item.transform&&item.transform[4])||0,y:Number(item.transform&&item.transform[5])||0,width:Number(item.width)||0};}).filter(function(item){return item.text;}).sort(function(a,b){return Math.abs(b.y-a.y)>2.5?b.y-a.y:a.x-b.x;}),lines=[];
    positioned.forEach(function(item){var line=lines.length&&Math.abs(lines[lines.length-1].y-item.y)<=2.5?lines[lines.length-1]:null;if(!line){line={page:pageNo,y:item.y,items:[]};lines.push(line);}line.items.push(item);});
    lines.forEach(function(line){line.items.sort(function(a,b){return a.x-b.x;});line.x=line.items[0].x;line.text=line.items.map(function(item){return item.text;}).join(' ').replace(/\s+/g,' ').trim();});return lines;
  }
  function pdfHeaderX(line,pattern,fallback){var item=line.items.find(function(entry){return pattern.test(clean(entry.text));});return item?item.x:fallback;}
  function pdfReference(value){var match=text(value).match(/\b(?:teng\s*tools?\s+)?(?:ref(?:erence)?|part\s*(?:no|number)|model|sku)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i);return match?match[1].replace(/[.,;:]+$/,''):'';}
  function pdfBrand(value){var source=text(value),brands=['Teng Tools','King Tony','Snap-on','Tork Craft','Mastercraft','Gedore','Bahco','Knipex','Toptul','Stanley','Fluke','Nitto'];for(var i=0;i<brands.length;i++)if(clean(source).indexOf(clean(brands[i]))===0||clean(source)===clean(brands[i]))return brands[i];return'';}
  function pdfLineItemId(value,brand){var source=text(value),ref=pdfReference(source);if(ref)return ref;if(brand){var withoutBrand=source.replace(new RegExp('^'+brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'');var model=withoutBrand.match(/^([A-Z0-9][A-Z0-9._\/-]*\d[A-Z0-9._\/-]*)\b/i);if(model)return model[1];}var leading=source.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})\s+(?=[A-Za-z])/);return leading&&/\d/.test(leading[1])?leading[1]:'';}
  function pdfConciseDescription(value,itemId){
    var source=text(value).replace(/\[\s*see below\s*\]/ig,' ').replace(/\s+/g,' ').trim(),reference=/\b(?:teng\s*tools?\s+)?(?:ref(?:erence)?|part\s*(?:no|number)|model|sku)\.?\s*[:#-]?\s*[A-Z0-9][A-Z0-9._\/-]{2,}/i,found=reference.exec(source),name=found?source.slice(0,found.index):source,after=found?source.slice(found.index+found[0].length):'';
    name=name.replace(/^(?:teng\s*tools?|professional-grade)\s+/i,'').replace(/[.,;:\s]+$/,'').trim();if(name.length>90)name=name.slice(Math.max(name.lastIndexOf('. ',name.length-90)+2,0));
    var family=productFamily(source);if(!name||/^(?:professional )?tools?$/i.test(name))name=familyLabel(family)||'Tool';
    var extras=[],spec=(source.match(/\bkey specifications?\s*:\s*([^.]*)/i)||[])[1];if(spec)extras.push(spec.trim());
    if(!spec&&after){var piece=(after.match(/\b\d+\s*[- ]piece\b[^.;]{0,72}/i)||[])[0];if(piece)extras.push(piece.split(/\b(?:neatly|organized|arranged|comprises|includes|with blade)\b/i)[0].trim());var range=(after.match(/\b\d+(?:\.\d+)?\s*mm\s*(?:through|to|[-–])\s*\d+(?:\.\d+)?\s*mm\b/i)||[])[0];if(range&&!extras.some(function(value){return clean(value).indexOf(clean(range))!==-1;}))extras.push(range);}
    var concise=[name].concat(extras.slice(0,2)).filter(Boolean).join(' · ').replace(/\s+/g,' ').trim();return concise||itemId||source.slice(0,120);
  }
  function pdfStructuredRows(lines){
    var output=[];var byPage={};lines.forEach(function(line){(byPage[line.page]||(byPage[line.page]=[])).push(line);});
    Object.keys(byPage).sort(function(a,b){return a-b;}).forEach(function(pageNo){var pageLines=byPage[pageNo],headerIndex=pageLines.findIndex(function(line){var value=clean(line.text);return /\bdescription\b/.test(value)&&/\b(?:qty|quantity)\b/.test(value)&&/\b(?:uom|unit)\b/.test(value);});if(headerIndex<0)return;var header=pageLines[headerIndex],numberX=pdfHeaderX(header,/^#|line/,header.x),stockX=pdfHeaderX(header,/stock|item code/,numberX+35),brandX=pdfHeaderX(header,/mfr|manufacturer|brand/,stockX+90),partX=pdfHeaderX(header,/part/,brandX+90),descriptionX=pdfHeaderX(header,/description|product/,partX+110),qtyX=pdfHeaderX(header,/qty|quantity/,descriptionX+220),unitX=pdfHeaderX(header,/uom|unit/,qtyX+45),certX=pdfHeaderX(header,/certificate/,unitX+55),starts=[numberX,stockX,brandX,partX,descriptionX,qtyX,unitX,certX],body=[];
      for(var i=headerIndex+1;i<pageLines.length;i++){var current=pageLines[i];if(/^(?:please include delivery|we require that|currency disclaimer|terms\s*&\s*conditions|page\s+\d+\s+of\s+\d+)/i.test(current.text))break;body.push(current);}
      function cell(line,index){var left=starts[index]-8,right=index===starts.length-1?Infinity:(starts[index+1]-8);return line.items.filter(function(item){return item.x>=left&&item.x<right;}).map(function(item){return item.text;}).join(' ').trim();}
      function isStart(line){var first=line.items[0],rowNumber=first&&first.text.match(/^\d{1,4}$/),quantity=cell(line,5),unit=cell(line,6);return !!(rowNumber&&first.x<brandX-10&&/^\d+(?:[.,]\d+)?$/.test(quantity)&&/^(?:piece|pieces|each|ea|set|sets|kit|kits|unit|units|pack|packs|box|boxes|pair|pairs)$/i.test(unit));}
      var groups=[];body.forEach(function(line){if(isStart(line))groups.push({start:line,continuation:[]});else if(groups.length)groups[groups.length-1].continuation.push(line);});
      groups.forEach(function(group){var start=group.start,detail=group.continuation.map(function(line){return line.text;}).join(' '),raw=[cell(start,4),detail].filter(Boolean).join(' '),brand=cell(start,2),part=cell(start,3),stock=cell(start,1),itemId=pdfReference(raw)||(/^\S+$/.test(part)?part:'')||(/^\S+$/.test(stock)&&!/see below/i.test(stock)?stock:'');output.push({sourceLine:cell(start,0),brand:brand||'N/A',itemId:itemId,description:pdfConciseDescription(raw,itemId),quantity:cell(start,5),unit:cell(start,6)});});
    });return output;
  }
  function pdfListRows(lines){
    var cue=lines.findIndex(function(line){return /\b(?:following|flowing)\s+items?\b|\bitems?\s+(?:below|required|needed)\b/i.test(line.text);}),pool=cue>=0?lines.slice(cue+1):lines,output=[];
    for(var i=0;i<pool.length;i++){var value=text(pool[i].text);if(/^(?:please note|delivery|deliveries|kind regards|regards|thank you|terms\s*&\s*conditions)/i.test(value))break;if(!value||value.length>120||/^(?:from|to|date|importance|subject|good (?:morning|afternoon)|rfq|bid closing|page \d+)/i.test(value)||/@|https?:|www\./i.test(value))continue;var letters=value.replace(/[^A-Za-z]/g,''),upper=value.replace(/[^A-Z]/g,''),brand=pdfBrand(value),family=productFamily(value),looksListed=letters.length>2&&upper.length/letters.length>=.62;if(!family&&!brand&&!looksListed)continue;var itemId=pdfLineItemId(value,brand);output.push({sourceLine:String(output.length+1),brand:brand||'N/A',itemId:itemId,description:value.replace(/\s+/g,' ').trim(),quantity:'',unit:''});}
    return output;
  }
  async function readPdf(file,job){
    setUploadProgress(job,8,'Loading the PDF reader…');await loadLibrary(pdfUrl,'pdfjsLib');if(job.cancelled)return[];window.pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorker;setUploadProgress(job,12,'Reading PDF…');var doc=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,lines=[];
    for(var pageNo=1;pageNo<=doc.numPages;pageNo++){if(job.cancelled)return[];setUploadProgress(job,20+(pageNo/doc.numPages)*45,'Reading PDF page '+pageNo+' of '+doc.numPages+'…');var page=await doc.getPage(pageNo),content=await page.getTextContent();lines=lines.concat(pdfVisualLines(content.items,pageNo));await nextFrame();}
    var structured=pdfStructuredRows(lines);if(structured.length)return structured;var listed=pdfListRows(lines);if(listed.length)return listed;return[];
  }
  async function handleFile(file){
    if(!file)return;var job=openUploadProgress(file);setStatus('Reading '+file.name+'…');var name=file.name.toLowerCase(),inputs=[];
    try{
      if(file.size>20*1024*1024)throw new Error('This file is larger than the 20 MB upload limit. Split it into smaller files.');
      setUploadProgress(job,8,'Reading file from this device…');
      if(name.endsWith('.csv')){var csvText=await file.text();if(job.cancelled)throw new Error('cancelled');setUploadProgress(job,45,'Identifying columns and rows…');inputs=rowsFromGrid(parseCsv(csvText));}
      else if(name.endsWith('.xlsx')||name.endsWith('.xls')){setUploadProgress(job,10,'Loading the Excel reader…');await loadLibrary(xlsxUrl,'XLSX');if(job.cancelled)throw new Error('cancelled');var buffer=await file.arrayBuffer();if(job.cancelled)throw new Error('cancelled');setUploadProgress(job,38,'Reading the first worksheet…');await nextFrame();var book=window.XLSX.read(buffer,{type:'array'});if(job.cancelled)throw new Error('cancelled');var sheet=book.Sheets[book.SheetNames[0]],grid=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});setUploadProgress(job,65,'Identifying columns and rows…');inputs=rowsFromGrid(grid);}
      else if(name.endsWith('.pdf')||file.type==='application/pdf')inputs=await readPdf(file,job);else throw new Error('Please upload an Excel, CSV or PDF file.');
      if(job.cancelled)throw new Error('cancelled');if(!inputs.length)throw new Error('No product rows could be identified in this file.');if(inputs.length>500)throw new Error('This file contains more than 500 product rows. Split it into smaller files.');sourceFileName=file.name;currentSessionHandle='';currentSessionName='';var imported=await importInputs(inputs,file.name,job);if(!imported)throw new Error('cancelled');var aiResult=await aiReviewRows(imported,job);if(job.cancelled)throw new Error('cancelled');rows=rows.concat(imported);render();setStatus(imported.length+' row'+(imported.length===1?'':'s')+' imported from '+file.name+'. '+(aiResult.used?aiResult.reviewed+' uncertain row'+(aiResult.reviewed===1?' was':'s were')+' reviewed. ':'Additional review was unavailable; local matching was retained. ')+'Review every red row before downloading.','success');setUploadProgress(job,100,'Import and matching complete');els.uploadCancel.disabled=true;els.uploadCancel.innerHTML=icon('check')+'Complete';setTimeout(function(){closeUploadProgress(job);},450);
    }catch(error){if(error.message==='cancelled'){setStatus('Upload cancelled. No rows were added.','error');setUploadProgress(job,0,'Upload cancelled. No rows were added.');}else{setStatus(error.message||'This file could not be read.','error');setUploadProgress(job,0,error.message||'This file could not be read.');}closeUploadProgress(job);}
    els.file.value='';
  }
  function exportRow(r,component,index){
    var item=component||r,componentQty=component?Number(component.quantity)||0:'',requiredTotal=componentQty!==''&&Number(r.quantity)?Number(r.quantity)*componentQty:'';
    var duplicates=duplicateCount(r);
    var interpretation=interpretedInput(r.inputTitle||r.inputId,r.inputBrand,r.inputId),researchSources=[r.setResearchSource].concat(r.aiSources||[]).filter(Boolean);
    return {'Source Line':r.sourceLine||r.row,'Import Row':r.row,'Original Input':r.inputTitle,'Detected Competitor Brand':interpretation.brand||r.inputBrand,'Detected Model or Part Number':interpretation.modelOrPartNumber||r.inputId,'Interpreted Product Type':r.detectedFamily,'Product Category':interpretation.productCategory,'Product Subtype':interpretation.productSubtype,'Critical Specifications':JSON.stringify(interpretation.criticalSpecifications),'Secondary Specifications':interpretation.secondarySpecifications.join('; '),'Administrative or Irrelevant Text':interpretation.administrativeOrIrrelevant.join('; '),'Quantity':r.quantity,'Unit':r.unit,'Possible Duplicate':duplicates>1?'Yes':'No','Identical Line Count':duplicates,'Grouped Line':r.isGroup?'Yes':'No','Set Result Type':r.setOutcome||'','Component No':component?index+1:'','Component Description':component?component.description:'','Component Qty per Set':component?component.quantity:'','Component Evidence':component?component.evidence||'':'','Required Total':requiredTotal,'Match Status':component?(item.status==='matched'?'Component match':item.status==='ignored'?'Ignored':'Manual review required'):(r.resultStatus||r.status),'Confidence Score':component?'':Number(r.confidenceScore)||0,'Match Type':component?'Component match':r.matchType,'TengTools Item ID':item.tengSku,'TengTools Product Title':item.tengTitle,'TengTools Product Type':productClassLabel(item.productClass),'TengTools Product URL':item.tengHandle?location.origin+'/products/'+item.tengHandle:'','Link Destination':item.tengHandle?'South Africa':'Unavailable','Specification Differences':r.matchWarning||'','Match Explanation':r.matchExplanation||item.reason,'Alternative Candidates':(r.alternatives||[]).map(function(candidate){return candidate.sku+' ('+candidate.confidence+'%)';}).join('; '),'Competitor Set Research Source':researchSources.join('; '),'Source Accessed':r.setResearchDate||'','Review Notes':r.reviewNotes||'','UNSPSC Code':item.unspsc,'UNSPSC Title':item.unspscTitle,'UNSPSC Version':component?'UNv260801':r.unspscVersion,'UNSPSC Confidence':component?'':r.unspscConfidence,'UNSPSC Review Status':component?'':r.unspscReviewStatus,'Match Reason':item.reason,'Review Decision':component?(item.status==='matched'?'Confirmed component':item.status==='ignored'?'Ignored component':'Needs component review'):r.decision};
  }
  function exportRows(list){var output=[];list.forEach(function(r){if(r.isGroup&&r.components&&r.components.length)r.components.forEach(function(component,index){output.push(exportRow(r,component,index));});else output.push(exportRow(r));});return output;}
  async function download(){
    if(!rows.length)return;var matched=exportRows(rows.filter(function(r){return r.status==='matched';})),exceptions=exportRows(rows.filter(function(r){return r.status!=='matched';})),date=new Date().toISOString().slice(0,10),name='TengTools_cross_reference_'+date+'.xlsx';
    try{await loadLibrary(xlsxUrl,'XLSX');var book=window.XLSX.utils.book_new(),main=window.XLSX.utils.json_to_sheet(matched.length?matched:[{'Match Status':'No confirmed matches'}]),review=window.XLSX.utils.json_to_sheet(exceptions.length?exceptions:[{'Match Status':'No exceptions'}]);window.XLSX.utils.book_append_sheet(book,main,'Matched Items');window.XLSX.utils.book_append_sheet(book,review,'Exceptions');window.XLSX.writeFile(book,name,{compression:true});setStatus('Excel workbook downloaded with Matched Items and Exceptions sheets.','success');return;}catch(error){}
    var data=exportRows(rows),headers=Object.keys(data[0]),csv='\ufeff'+[headers].concat(data.map(function(r){return headers.map(function(h){return '"'+text(r[h]).replace(/"/g,'""')+'"';});})).map(function(line){return line.join(',');}).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace('.xlsx','.csv');a.click();URL.revokeObjectURL(url);setStatus('CSV downloaded. The Excel export library was unavailable.','success');
  }
  els.form.addEventListener('submit',function(event){event.preventDefault();var query=text(els.query.value);if(!query){setStatus('Enter a tool name or item ID first.','error');els.query.focus();return;}displaySuggestions(query,1);});
  document.querySelectorAll('#tt-match input[name="ttm-product-type"]').forEach(function(input){input.addEventListener('change',function(){if(!selectedProductTypes().length){input.checked=true;setStatus('Keep at least one product type selected.','error');return;}if(text(els.query.value))displaySuggestions(text(els.query.value),1);});});
  els.pagination.addEventListener('click',function(event){var button=event.target.closest('[data-suggestion-page]');if(!button||button.disabled)return;displaySuggestions(text(els.query.value),Number(button.dataset.suggestionPage),true);});
  els.suggestions.addEventListener('click',function(event){var use=event.target.closest('[data-use-result]');if(use){var query=text(els.query.value),product=use._match;if(manualContext){var context=manualContext;if(context.component){context.component.status='matched';context.component.tengSku=product.sku;context.component.tengTitle=product.title;context.component.tengImage=product.image;context.component.tengHandle=product.handle;context.component.productClass=product.productClass;context.component.unspsc=product.unspsc;context.component.unspscTitle=product.unspscTitle;context.component.unspscVersion=product.unspscVersion||'UNv260801';context.component.unspscConfidence=product.confidence;context.component.unspscReviewStatus=product.reviewStatus;context.component.unspscSource=product.unspscSource||'';context.component.category=categoryLabel(productFamily(context.component.description)||product._family);context.component.reason='Selected by logged-in user';updateGroupStatus(context.row);render();}else matchRow(context.row,product,true);cancelManual('Match confirmed: '+product.sku+' · '+product.title+'.');var matchedRow=els.body.querySelector('tr[data-row="'+context.row.row+'"]');if(matchedRow)setTimeout(function(){matchedRow.scrollIntoView({behavior:'smooth',block:'center'});},100);return;}var row=rowFromInput({brand:'Search entry',itemId:query,inputTitle:query});rows.push(row);matchRow(row,product,false);setStatus(product.sku+' added as a confirmed search selection.','success');return;}if(event.target.closest('[data-add-unresolved]')){addRow({brand:'Not supplied',itemId:text(els.query.value),description:text(els.query.value)});els.suggestions.hidden=true;setStatus('Added as a red review row.','error');}});
  els.manualCancel.addEventListener('click',function(){cancelManual();});
  els.file.addEventListener('change',function(){handleFile(els.file.files[0]);});
  els.uploadCancel.addEventListener('click',function(){if(!uploadJob)return;uploadJob.cancelled=true;if(uploadJob.controller)uploadJob.controller.abort();els.uploadCancel.disabled=true;els.uploadCancel.innerHTML=icon('close')+'Cancelling…';els.uploadMessage.textContent='Stopping safely…';});
  els.uploadDialog.addEventListener('cancel',function(event){event.preventDefault();if(uploadJob&&!uploadJob.cancelled)els.uploadCancel.click();});
  function closeDataInfo(){els.dataInfoBox.hidden=true;els.dataInfoTrigger.setAttribute('aria-expanded','false');}
  els.dataInfoTrigger.addEventListener('click',function(){var opening=els.dataInfoBox.hidden;els.dataInfoBox.hidden=!opening;els.dataInfoTrigger.setAttribute('aria-expanded',opening?'true':'false');if(opening)els.dataInfoClose.focus();});
  els.dataInfoClose.addEventListener('click',function(){closeDataInfo();els.dataInfoTrigger.focus();});
  $('ttm-add-row').addEventListener('click',function(){addRow({brand:'Not supplied',description:'New manual row'});setStatus('Manual row added. Use “Match manually” to search the TengTools range.','success');});
  els.saveSession.addEventListener('click',openSaveDialog);
  els.savedSessions.addEventListener('click',openSessionLibrary);
  els.saveForm.addEventListener('submit',function(event){event.preventDefault();saveCloudSession();});
  els.saveDialog.querySelector('[data-save-cancel]').addEventListener('click',function(){els.saveDialog.close();els.saveSession.focus();});
  els.sessionsDialog.querySelector('[data-sessions-close]').addEventListener('click',function(){els.sessionsDialog.close();els.savedSessions.focus();});
  els.sessionList.addEventListener('click',async function(event){var button=event.target.closest('[data-load-session]');if(!button)return;button.disabled=true;var loaded=await loadCloudSession(button.dataset.loadSession);button.disabled=false;if(loaded)els.sessionsDialog.close();});
  els.clearSaved.addEventListener('click',function(){els.clearDialog.showModal();});
  els.clearDialog.querySelector('[data-dialog-cancel]').addEventListener('click',function(){els.clearDialog.close();});
  els.clearDialog.querySelector('[data-dialog-confirm]').addEventListener('click',function(){els.clearDialog.close();els.clearFinalDialog.showModal();});
  els.clearDialog.addEventListener('click',function(event){if(event.target===els.clearDialog)els.clearDialog.close();});
  els.clearFinalDialog.querySelector('[data-final-cancel]').addEventListener('click',function(){els.clearFinalDialog.close();els.clearSaved.focus();});
  els.clearFinalDialog.querySelector('[data-final-confirm]').addEventListener('click',function(){rows=[];nextRow=1;render();els.clearFinalDialog.close();setStatus('The table was cleared from this browser.','success');els.clearSaved.focus();});
  els.clearFinalDialog.addEventListener('click',function(event){if(event.target===els.clearFinalDialog){els.clearFinalDialog.close();els.clearSaved.focus();}});
  els.download.addEventListener('click',download);
  document.querySelectorAll('#tt-match .ttm-filter').forEach(function(button){button.addEventListener('click',function(){activeFilter=button.dataset.filter;document.querySelectorAll('#tt-match .ttm-filter').forEach(function(other){other.setAttribute('aria-pressed',other===button?'true':'false');});render();});});
  els.columnsTrigger.addEventListener('click',function(){var opening=els.columnsMenu.hidden;els.columnsMenu.hidden=!opening;els.columnsTrigger.setAttribute('aria-expanded',opening?'true':'false');if(opening)renderColumnOptions();});
  els.columnOptions.addEventListener('change',function(event){var input=event.target.closest('input[type="checkbox"]');if(!input)return;var next=Array.from(els.columnOptions.querySelectorAll('input:checked')).map(function(item){return item.value;});if(!next.length){input.checked=true;return;}visibleColumns=next;saveVisibleColumns();applyColumnVisibility();setStatus('Visible columns updated and saved on this device.','success');});
  document.querySelectorAll('#tt-match [data-sort]').forEach(function(button){button.addEventListener('click',function(){sortDirection=sortKey===button.dataset.sort?-sortDirection:1;sortKey=button.dataset.sort;render();});});
  document.querySelectorAll('#tt-match thead th').forEach(function(th,index){th.dataset.column=baseColumns[index];th.draggable=true;th.title='Drag to rearrange this column'+(th.querySelector('[data-sort]')?'. Click its label to sort.':'.');var resizer=document.createElement('span');resizer.className='ttm-column-resizer';resizer.setAttribute('aria-hidden','true');resizer.draggable=false;th.appendChild(resizer);});
  var tableHead=document.querySelector('#tt-match thead');
  tableHead.addEventListener('dragstart',function(event){var th=event.target.closest('th[data-column]');if(!th)return;draggedColumn=th.dataset.column;th.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedColumn);});
  tableHead.addEventListener('dragover',function(event){var th=event.target.closest('th[data-column]');if(!th||!draggedColumn||th.dataset.column===draggedColumn)return;event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('#tt-match thead th').forEach(function(cell){cell.classList.remove('is-drop-target');});th.classList.add('is-drop-target');});
  tableHead.addEventListener('drop',function(event){var target=event.target.closest('th[data-column]');if(!target||!draggedColumn||target.dataset.column===draggedColumn)return;event.preventDefault();var from=columnOrder.indexOf(draggedColumn),to=columnOrder.indexOf(target.dataset.column);columnOrder.splice(from,1);columnOrder.splice(to,0,draggedColumn);saveColumnOrder();applyColumnOrderToHeader();render();setStatus('Column order updated and saved on this device.','success');});
  tableHead.addEventListener('dragend',function(){draggedColumn='';document.querySelectorAll('#tt-match thead th').forEach(function(cell){cell.classList.remove('is-dragging','is-drop-target');});});
  tableHead.addEventListener('mousedown',function(event){var handle=event.target.closest('.ttm-column-resizer');if(!handle)return;event.preventDefault();event.stopPropagation();var th=handle.closest('th'),table=th.closest('table');resizeState={th:th,key:th.dataset.column,startX:event.clientX,startWidth:th.getBoundingClientRect().width,startTableWidth:table.getBoundingClientRect().width,table:table};th.draggable=false;document.body.classList.add('ttm-is-resizing');});
  document.addEventListener('mousemove',function(event){if(!resizeState)return;var delta=event.clientX-resizeState.startX,newWidth=Math.max(minimumColumnWidth(resizeState.key),resizeState.startWidth+delta),appliedDelta=newWidth-resizeState.startWidth;resizeState.th.style.width=newWidth+'px';resizeState.table.style.width=Math.max(resizeState.startTableWidth+appliedDelta,resizeState.table.parentElement.clientWidth)+'px';columnWidths[resizeState.key]=Math.round(newWidth);});
  document.addEventListener('mouseup',function(){if(!resizeState)return;resizeState.th.draggable=true;saveColumnWidths();resizeState=null;document.body.classList.remove('ttm-is-resizing');setStatus('Column width updated and saved on this device.','success');});
  $('ttm-reset-columns').addEventListener('click',function(){columnOrder=baseColumns.slice();visibleColumns=baseColumns.slice();columnWidths={};try{localStorage.removeItem(storageKey+'-columns');localStorage.removeItem(storageKey+'-column-widths');localStorage.removeItem(storageKey+'-visible-columns');}catch(error){}var table=document.querySelector('#tt-match table');table.style.width='';applyColumnOrderToHeader();render();setStatus('Columns reset to the compact fit-to-page layout.','success');});
  document.addEventListener('click',function(event){if(!event.target.closest('.ttm-columns-control')){els.columnsMenu.hidden=true;els.columnsTrigger.setAttribute('aria-expanded','false');}if(!event.target.closest('.ttm-data-info'))closeDataInfo();document.querySelectorAll('#tt-match .ttm-action-menu[open]').forEach(function(menu){if(!menu.contains(event.target))menu.removeAttribute('open');});});
  document.addEventListener('keydown',function(event){if(event.key!=='Escape')return;els.columnsMenu.hidden=true;els.columnsTrigger.setAttribute('aria-expanded','false');closeDataInfo();document.querySelectorAll('#tt-match .ttm-action-menu[open]').forEach(function(menu){menu.removeAttribute('open');});});
  els.body.addEventListener('toggle',function(event){var menu=event.target.closest&&event.target.closest('.ttm-action-menu');if(!menu||!menu.open)return;document.querySelectorAll('#tt-match .ttm-action-menu[open]').forEach(function(other){if(other!==menu)other.removeAttribute('open');});var summary=menu.querySelector('summary'),list=menu.querySelector('.ttm-action-list'),rect=summary.getBoundingClientRect(),menuHeight=132,left=Math.max(8,Math.min(window.innerWidth-180,rect.right-172)),top=rect.bottom+5;if(top+menuHeight>window.innerHeight)top=Math.max(8,rect.top-menuHeight-5);list.style.left=left+'px';list.style.top=top+'px';},true);
  els.body.addEventListener('submit',function(event){var form=event.target.closest('[data-component-form]');if(!form)return;event.preventDefault();var tr=form.closest('tr'),row=rows.find(function(item){return item.row===Number(tr.dataset.row);});if(!row)return;row.components.push(componentFromInput(form.elements.description.value,form.elements.quantity.value));updateGroupStatus(row);render();setStatus('Component added to source line '+(row.sourceLine||row.row)+'.','success');});
  els.body.addEventListener('click',function(event){
    var undo=event.target.closest('[data-undo-delete]');if(undo){undoDelete(undo.dataset.undoDelete);return;}
    var tr=event.target.closest('tr');if(!tr)return;var row=rows.find(function(item){return item.row===Number(tr.dataset.row);});if(!row)return;
    var componentEl=event.target.closest('[data-component]'),component=componentEl&&row.components.find(function(item){return item.id===componentEl.dataset.component;});
    var componentAction=event.target.closest('[data-component-action]');
    if(component&&componentAction){var kind=componentAction.dataset.componentAction;if(kind==='delete')row.components=row.components.filter(function(item){return item.id!==component.id;});else if(kind==='ignore'){component.status='ignored';component.reason='Ignored by user';}else if(kind==='restore'){component.status='review';component.reason=component.tengSku?'Candidate restored; confirmation required':'No reliable automatic match found';}else if(kind==='manual'){openManual(row,component);return;}updateGroupStatus(row);render();return;}
    var action=event.target.closest('[data-action]');if(!action)return;var actionMenu=action.closest('.ttm-action-menu');if(actionMenu)actionMenu.removeAttribute('open');if(action.dataset.action==='toggle-mobile'){var opening=!tr.classList.contains('is-mobile-open');tr.classList.toggle('is-mobile-open',opening);action.setAttribute('aria-expanded',opening?'true':'false');return;}if(action.dataset.action==='toggle-group'){row.expanded=!row.expanded;render();var toggle=els.body.querySelector('tr[data-row="'+row.row+'"] [data-action="toggle-group"]');if(toggle)toggle.focus();}else if(action.dataset.action==='ignore'){row.status='ignored';row.decision='Ignored by user';row.reason='Excluded from export review by user';render();}else if(action.dataset.action==='restore'){row.status='review';row.decision='Needs review';row.reason=row.tengSku?'Candidate restored; confirmation required':'No reliable automatic match found';render();}else if(action.dataset.action==='manual')openManual(row);else if(action.dataset.action==='delete')deleteRowWithUndo(tr,row);
  });
  fetch(catalogUrl,{credentials:'same-origin'}).then(function(response){if(!response.ok)throw new Error('Product master unavailable');return response.json();}).then(async function(payload){products=catalogArray(payload).map(normalizeProduct).filter(function(p){return p.sku&&p.title;});applyUnspscFallbacks();indexProducts();catalogReady=true;root.dataset.catalogReady='true';setStatus('');var updated=await revalidateRestoredRows();if(updated)setStatus('Your saved review has been updated to the latest matcher.','success');}).catch(function(){setStatus('The TengTools product master could not be loaded. Please refresh the page.','error');});
  loadColumnOrder();applyColumnOrderToHeader();restoreSavedRows();render();var requestedSession=new URLSearchParams(location.search).get('session');if(requestedSession)loadCloudSession(requestedSession);
})();
