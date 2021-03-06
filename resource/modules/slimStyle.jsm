Modules.VERSION = '2.0.0';

this.slimStyle = {
	get clipPathURLBarWrapper () { return $(objName+'-slimChrome-clipPath-urlbar-wrapper-path'); },
	get clipPathLeft () { return $(objName+'-slimChrome-clipPath-toolbars-left-path'); },
	get clipPathRight () { return $(objName+'-slimChrome-clipPath-toolbars-right-path'); },
	get SVGLeft () { return $(objName+'-slimChrome-svg-'+(RTL ? 'after' : 'before')+'-path'); },
	get SVGRight () { return $(objName+'-slimChrome-svg-'+(RTL ? 'before' : 'after')+'-path'); },
	
	childObserver: null,
	hiddenObserver: null,
	
	_style: null,
	get style () { return this._style || Prefs.slimStyle; },
	set style (v) {
		if(v) {
			Timers.init('resetSlimStyle', () => {
				this.style = null;
			}, 2250);
		}
		this._style = v;
		this.apply();
	},
	
	AUSTRALIS_BORDER_WIDTH_BASE: 34, // the size of the border element, basically how far it extends
	AUSTRALIS_BORDER_WIDTH_INCR: 8, // how much should the border extend with each toolbar added, so that it doesn't distort
	AUSTRALIS_BORDER_OFFSET_Y1: 0.015, // percentage by which the border svg ends should be offset of the actual clipPath (top)
	AUSTRALIS_BORDER_OFFSET_Y2: 0.015, // percentage by which the border svg ends should be offset of the actual clipPath (bottom)
	AUSTRALIS_BORDER_MARGIN_ADJUST_TOOLBARS: -6, // this is added to AUSTRALIS_BORDER_WIDTH and that is applied as the toolbars' container margin
	AUSTRALIS_BORDER_MARGIN_ADJUST_BOTTOM: 2, // this is added to the margins of the australis bottom border container
	AUSTRALIS_BORDER_NAVBAR_MARGIN: 5, // negative margin for the nav-bar so there isn't a huge space between it and the others
	AUSTRALIS_BORDER_TOOLBAR_MARGIN: 3, // incremented to the nav-bar per-toolbar
	
	get AUSTRALIS_BORDER_WIDTH () { return this.AUSTRALIS_BORDER_WIDTH_BASE + (this.AUSTRALIS_BORDER_WIDTH_INCR * this.numToolbars()); },
	
	// I don't know why but the bottom part of the SVG line doesn't match exactly the outer clip-path,
	// even though they both use the same values and should have the same dimensions...
	get AUSTRALIS_BORDER_OFFSET_YS () {
		if(!WINNT) {
			return (this.numToolbars() > 1) ? 0.02 : 0.04;
		}	
		else if(Services.navigator.oscpu.startsWith('Windows NT 5.1')) {
			return (this.numToolbars() > 1) ? 0.01 : 0.02;
		}
		return (this.numToolbars() > 1) ? 0.04 : 0.06;
	},
	
	// the following define the shape and curvature of the australis-style container borders; values are a decimal percentage of the total border size
	// used as "M COORD_X1,COORD_Y1 C CURVE1_X1,CURVE1_Y1 CURVE1_X2,CURVE1_Y2 COORD_X2,COORD_Y2 CURVE1_X1,CURVE1_Y1 CURVE2_X2,CURVE2_Y2 COORD_X3,COORD_Y3 [...]";
	// see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
	
	AUSTRALIS_BORDER_CURVE1_X1: 0,
	AUSTRALIS_BORDER_CURVE1_Y1: 0,
	AUSTRALIS_BORDER_CURVE1_X2: 0.04,
	AUSTRALIS_BORDER_CURVE1_Y2: 0,
	
	AUSTRALIS_BORDER_CURVE2_X1: 0.49,
	AUSTRALIS_BORDER_CURVE2_Y1: 0.02,
	AUSTRALIS_BORDER_CURVE2_X2: 0.46,
	AUSTRALIS_BORDER_CURVE2_Y2: 0.38,
	
	AUSTRALIS_BORDER_CURVE3_X1: 0.54,
	AUSTRALIS_BORDER_CURVE3_Y1: 0.62,
	AUSTRALIS_BORDER_CURVE3_X2: 0.51,
	AUSTRALIS_BORDER_CURVE3_Y2: 0.98,
	
	AUSTRALIS_BORDER_CURVE4_X1: 0.96,
	AUSTRALIS_BORDER_CURVE4_Y1: 1,
	AUSTRALIS_BORDER_CURVE4_X2: 1,
	AUSTRALIS_BORDER_CURVE4_Y2: 1,
	
	AUSTRALIS_BORDER_COORD_X1: 0,
	AUSTRALIS_BORDER_COORD_Y1: 0,
	AUSTRALIS_BORDER_COORD_X2: 0.04,
	AUSTRALIS_BORDER_COORD_Y2: 0.015,
	AUSTRALIS_BORDER_COORD_X3: 0.5,
	AUSTRALIS_BORDER_COORD_Y3: 0.5,
	AUSTRALIS_BORDER_COORD_X4: 0.96,
	AUSTRALIS_BORDER_COORD_Y4: 0.985,
	AUSTRALIS_BORDER_COORD_X5: 1,
	AUSTRALIS_BORDER_COORD_Y5: 1,
	
	// some gradients for use with personas
	bgGradientWINNT: 'rgba(253,253,253,0.4) 0px, rgba(255,255,255,0) 36px, rgba(255,255,255,0)',
	bgGradientDARWIN: 'rgba(253,253,253,0.45), rgba(253,253,253,0.45)',
	bgGradientLINUX: 'rgba(255,255,255,.25) 0px, rgba(255,255,255,0) 36px, rgba(255,255,255,0)',
	
	handleEvent: function(e) {
		switch(e.type) {
			case 'MovedSlimChrome':
				this.clipPaths();
				break;
			
			case 'EnsureSlimChrome':
				this.onEnsure();
				break;
			
			case 'LoadedSlimChrome':
				this.init();
				break;
			
			case 'UnloadingSlimChrome':
				this.deinit();
				break;
		}
	},
	
	observe: function(aSubject, aTopic, aData) {
		switch(aTopic) {
			case 'nsPref:changed':
				switch(aSubject) {
					case 'slimStyle':
						this.apply();
						break;
				}
				break;
			
			case 'lightweight-theme-styling-update':
				aSync(() => { this.stylePersona(); });
				break;
			
			case 'lightweight-theme-preview-requested':
				slimChrome.initialShow();
				break;
		}
	},
	
	clipPaths: function() {
		aSync(() => { this.stylePersona(); });
		
		if(this.style == 'compact') {
			var d = !DARWIN ? 'm 1,-5 l 0,7.8 l 0,0.2 l 0,50 l 10000,0 l 0,-100 l -10000,0 z' : 'M 1,-5 l 0,50 l 10000,0 l 0,-100 l -10000,0 z';
			setAttribute(this.clipPathURLBarWrapper, 'd', d);
			return;
		}
		
		if(this.style != 'australis' || typeof(slimChrome) == 'undefined' || !slimChrome.lastStyle) { return; }
		
		// we don't want to calculate the paths in this case, as they rely on the actual height of the toolbars, which would be incorrect here;
		// the paths will be re-done when the chrome is next shown
		if(trueAttribute(slimChrome.container, 'onlyURLBar') && !trueAttribute(slimChrome.container, 'hover')) {
			removeAttribute(slimChrome.container, 'numToolbars');
			return;
		}
		
		var width = this.AUSTRALIS_BORDER_WIDTH;
		
		// don't bother if nothing changed in the meantime
		if(slimChrome.container._borderSize == width && slimChrome.container._lastWidth == slimChrome.lastStyle.width) {
			return;
		}
		slimChrome.container._borderSize = width;
		slimChrome.container._lastWidth = slimChrome.lastStyle.width;
		
		var bottomMargin = width -this.AUSTRALIS_BORDER_WIDTH_INCR +this.AUSTRALIS_BORDER_MARGIN_ADJUST_BOTTOM;
		var bottomWidth = bottomMargin *2;
		
		var toolbarsMargin = width +this.AUSTRALIS_BORDER_MARGIN_ADJUST_TOOLBARS;
		var toolbarsWidth = toolbarsMargin *2;
		
		var navbarMargin = this.AUSTRALIS_BORDER_NAVBAR_MARGIN + (this.AUSTRALIS_BORDER_TOOLBAR_MARGIN *this.numToolbars());
		
		var sscode = '/*The Fox, Only Better CSS declarations of variable values*/\n';
		sscode += '@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\n';
		sscode += '@-moz-document url("'+document.baseURI+'") {\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"]:not([chromehidden~="toolbar"]) #navigator-toolbox[slimStyle="australis"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #'+objName+'-slimChrome-toolbars-before,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"]:not([chromehidden~="toolbar"]) #navigator-toolbox[slimStyle="australis"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #'+objName+'-slimChrome-toolbars-after {\n';
		sscode += '		width: ' + width + 'px;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"]:not([chromehidden~="toolbar"]) #theFoxOnlyBetter-slimChrome-toolbars-bottom {\n';
		sscode += '		margin-left: ' + bottomMargin + 'px;\n';
		sscode += '		margin-right: ' + bottomMargin + 'px;\n';
		sscode += '		width: calc(100% - ' + bottomWidth + 'px);\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"]:not([chromehidden~="toolbar"]) #navigator-toolbox[slimStyle="australis"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #'+objName+'-slimChrome-toolbars {\n';
		sscode += '		margin-left: ' + toolbarsMargin + 'px !important;\n';
		sscode += '		margin-right: ' + toolbarsMargin + 'px !important;\n';
		sscode += '		width: calc(100% - ' + toolbarsWidth + 'px) !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"]:not([chromehidden~="toolbar"]) #navigator-toolbox[slimStyle="australis"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #nav-bar {\n';
		sscode += '		margin: 0 -'+navbarMargin+'px;\n';
		sscode += '	}\n';
		sscode += '}';
		
		Styles.load('slimChromeSVG_'+_UUID, sscode, true);
		
		// the left border
		var d = "M "+this.AUSTRALIS_BORDER_COORD_X1+","+this.AUSTRALIS_BORDER_COORD_Y1;
		d += " C";
		d += " "+this.AUSTRALIS_BORDER_CURVE1_X1+","+this.AUSTRALIS_BORDER_CURVE1_Y1;
		d += " "+this.AUSTRALIS_BORDER_CURVE1_X2+","+this.AUSTRALIS_BORDER_CURVE1_Y2;
		d += " "+this.AUSTRALIS_BORDER_COORD_X2+","+this.AUSTRALIS_BORDER_COORD_Y2;
		d += " "+this.AUSTRALIS_BORDER_CURVE2_X1+","+this.AUSTRALIS_BORDER_CURVE2_Y1;
		d += " "+this.AUSTRALIS_BORDER_CURVE2_X2+","+this.AUSTRALIS_BORDER_CURVE2_Y2;
		d += " "+this.AUSTRALIS_BORDER_COORD_X3+","+this.AUSTRALIS_BORDER_COORD_Y3;
		d += " "+this.AUSTRALIS_BORDER_CURVE3_X1+","+(this.AUSTRALIS_BORDER_CURVE3_Y1-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+this.AUSTRALIS_BORDER_CURVE3_X2+","+(this.AUSTRALIS_BORDER_CURVE3_Y2-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+this.AUSTRALIS_BORDER_COORD_X4+","+(this.AUSTRALIS_BORDER_COORD_Y4-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+this.AUSTRALIS_BORDER_CURVE4_X1+","+this.AUSTRALIS_BORDER_CURVE4_Y1;
		d += " "+this.AUSTRALIS_BORDER_CURVE4_X2+","+this.AUSTRALIS_BORDER_CURVE4_Y2;
		d += " "+this.AUSTRALIS_BORDER_COORD_X5+","+this.AUSTRALIS_BORDER_COORD_Y5;
		d += " L "+this.AUSTRALIS_BORDER_COORD_X5+","+this.AUSTRALIS_BORDER_COORD_Y1+" z";
		setAttribute(this.clipPathLeft, 'd', d);
		
		// now we draw the actual border strokes
		var d = "M "+this.AUSTRALIS_BORDER_COORD_X1+","+(this.AUSTRALIS_BORDER_COORD_Y1-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " C";
		d += " "+this.AUSTRALIS_BORDER_CURVE1_X1+","+(this.AUSTRALIS_BORDER_CURVE1_Y1-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+this.AUSTRALIS_BORDER_CURVE1_X2+","+(this.AUSTRALIS_BORDER_CURVE1_Y2-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+this.AUSTRALIS_BORDER_COORD_X2+","+(this.AUSTRALIS_BORDER_COORD_Y2-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+this.AUSTRALIS_BORDER_CURVE2_X1+","+this.AUSTRALIS_BORDER_CURVE2_Y1;
		d += " "+this.AUSTRALIS_BORDER_CURVE2_X2+","+this.AUSTRALIS_BORDER_CURVE2_Y2;
		d += " "+this.AUSTRALIS_BORDER_COORD_X3+","+this.AUSTRALIS_BORDER_COORD_Y3;
		d += " "+this.AUSTRALIS_BORDER_CURVE3_X1+","+this.AUSTRALIS_BORDER_CURVE3_Y1;
		d += " "+this.AUSTRALIS_BORDER_CURVE3_X2+","+this.AUSTRALIS_BORDER_CURVE3_Y2;
		d += " "+this.AUSTRALIS_BORDER_COORD_X4+","+(this.AUSTRALIS_BORDER_COORD_Y4+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+this.AUSTRALIS_BORDER_CURVE4_X1+","+(this.AUSTRALIS_BORDER_CURVE4_Y1+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+this.AUSTRALIS_BORDER_CURVE4_X2+","+(this.AUSTRALIS_BORDER_CURVE4_Y2+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+this.AUSTRALIS_BORDER_COORD_X5+","+(this.AUSTRALIS_BORDER_COORD_Y5+this.AUSTRALIS_BORDER_OFFSET_Y2);
		setAttribute(this.SVGLeft, 'd', d);
		
		// next bit, the right border
		var d = "M "+(1-this.AUSTRALIS_BORDER_COORD_X5)+","+this.AUSTRALIS_BORDER_COORD_Y5;
		d += " C";
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE4_X2)+","+this.AUSTRALIS_BORDER_CURVE4_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE4_X1)+","+this.AUSTRALIS_BORDER_CURVE4_Y1;
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X4)+","+(this.AUSTRALIS_BORDER_COORD_Y4-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE3_X2)+","+(this.AUSTRALIS_BORDER_CURVE3_Y2-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE3_X1)+","+(this.AUSTRALIS_BORDER_CURVE3_Y1-this.AUSTRALIS_BORDER_OFFSET_YS);
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X3)+","+this.AUSTRALIS_BORDER_COORD_Y3;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE2_X2)+","+this.AUSTRALIS_BORDER_CURVE2_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE2_X1)+","+this.AUSTRALIS_BORDER_CURVE2_Y1;
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X2)+","+this.AUSTRALIS_BORDER_COORD_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE1_X2)+","+this.AUSTRALIS_BORDER_CURVE1_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE1_X1)+","+this.AUSTRALIS_BORDER_CURVE1_Y1;
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X1)+","+this.AUSTRALIS_BORDER_COORD_Y1;
		d += " L "+(1-this.AUSTRALIS_BORDER_COORD_X5)+","+this.AUSTRALIS_BORDER_COORD_Y1+" z";
		setAttribute(this.clipPathRight, 'd', d);
		
		// and again the border
		var d = "M "+(1-this.AUSTRALIS_BORDER_COORD_X5)+","+(this.AUSTRALIS_BORDER_COORD_Y5+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " C";
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE4_X2)+","+(this.AUSTRALIS_BORDER_CURVE4_Y2+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE4_X1)+","+(this.AUSTRALIS_BORDER_CURVE4_Y1+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X4)+","+(this.AUSTRALIS_BORDER_COORD_Y4+this.AUSTRALIS_BORDER_OFFSET_Y2);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE3_X2)+","+this.AUSTRALIS_BORDER_CURVE3_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE3_X1)+","+this.AUSTRALIS_BORDER_CURVE3_Y1;
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X3)+","+this.AUSTRALIS_BORDER_COORD_Y3;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE2_X2)+","+this.AUSTRALIS_BORDER_CURVE2_Y2;
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE2_X1)+","+this.AUSTRALIS_BORDER_CURVE2_Y1;
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X2)+","+(this.AUSTRALIS_BORDER_COORD_Y2-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE1_X2)+","+(this.AUSTRALIS_BORDER_CURVE1_Y2-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+(1-this.AUSTRALIS_BORDER_CURVE1_X1)+","+(this.AUSTRALIS_BORDER_CURVE1_Y1-this.AUSTRALIS_BORDER_OFFSET_Y1);
		d += " "+(1-this.AUSTRALIS_BORDER_COORD_X1)+","+(this.AUSTRALIS_BORDER_COORD_Y1-this.AUSTRALIS_BORDER_OFFSET_Y1);
		setAttribute(this.SVGRight, 'd', d);
	},
	
	numToolbars: function() {
		var t = 0;
		for(let child of slimChrome.toolbars.childNodes) {
			if(!child.hidden && !child.collapsed) {
				t++;
			}
		}
		return t;
	},
	
	apply: function() {
		setAttribute(gNavToolbox, 'slimStyle', this.style);
		this.clipPaths();
	},
	
	onEnsure: function() {
		// make sure this is applied at least once, and only when the chrome is actually shown
		if(trueAttribute(slimChrome.container, 'hover') || !trueAttribute(slimChrome.container, 'onlyURLBar')) {
			var t = this.numToolbars();
			if(parseInt(slimChrome.container.getAttribute('numToolbars')) != t) {
				setAttribute(slimChrome.container, 'numToolbars', this.numToolbars());
				this.clipPaths();
			}
		}
	},
	
	// some personas stuff
	
	lwtheme: {
		bgImage: '',
		color: '',
		bgColor: ''
	},
	
	stylePersona: function() {
		if(typeof(slimChrome) == 'undefined' || !slimChrome.container || !slimChrome.lastStyle) { return; }
		
		if(!trueAttribute(document.documentElement, 'lwtheme')) {
			this.lwtheme.bgImage = '';
			this.lwtheme.color = '';
			this.lwtheme.bgColor = '';
		}
		else {
			var windowStyle = getComputedStyle(document.documentElement);
			if(this.lwtheme.bgImage != windowStyle.backgroundImage && windowStyle.backgroundImage != 'none') {
				this.lwtheme.bgImage = windowStyle.backgroundImage;
				this.lwtheme.color = windowStyle.color;
				this.lwtheme.bgColor = windowStyle.backgroundColor;
			}
		}
		
		// Unload current stylesheet if it's been loaded
		if(!this.lwtheme.bgImage) {
			Styles.unload('personaSlimChrome_'+_UUID);
			return;
		}
		
		var windowStyle = getComputedStyle(document.documentElement);
		var containerBox = slimChrome.container.getBoundingClientRect();
		var containerStyle = getComputedStyle(slimChrome.container);
		
		// Another personas in OSX tweak
		var offsetWindowPadding = windowStyle.backgroundPosition;
		var offsetY = -containerBox.top;
		offsetY += parseInt(containerStyle.marginTop);
		if(offsetWindowPadding.contains(' ') && offsetWindowPadding.contains('px', offsetWindowPadding.indexOf(' ') +1)) {
			offsetY += parseInt(offsetWindowPadding.substr(offsetWindowPadding.indexOf(' ') +1, offsetWindowPadding.indexOf('px', offsetWindowPadding.indexOf(' ') +1)));
		}
		
		if(containerStyle.direction == 'ltr') {
			var borderStart = parseInt(containerStyle.borderLeftWidth);
		} else {
			var borderStart = parseInt(containerStyle.borderRightWidth);
		}
		
		// +1/-1 compensates for borders misplacement in CSS
		if(LTR) {
			var offsetX = -slimChrome.lastStyle.left +document.documentElement.clientWidth -borderStart;
			var fullOffsetX = -slimChrome.lastStyle.fullLeft +document.documentElement.clientWidth -borderStart;
			var australisOffsetX = offsetX -this.AUSTRALIS_BORDER_WIDTH -this.AUSTRALIS_BORDER_MARGIN_ADJUST_TOOLBARS;
			var australisOffsetXLeft = offsetX +1;
			var australisOffsetXRight = slimChrome.lastStyle.right +this.AUSTRALIS_BORDER_WIDTH +borderStart -1;
		} else {
			var offsetX = -slimChrome.lastStyle.right -borderStart;
			var fullOffsetX = -slimChrome.lastStyle.fullRight -borderStart;
			var australisOffsetX = offsetX -this.AUSTRALIS_BORDER_WIDTH -this.AUSTRALIS_BORDER_MARGIN_ADJUST_TOOLBARS;
			var australisOffsetXRight = offsetX +1;
			var australisOffsetXLeft = -document.documentElement.clientWidth +slimChrome.lastStyle.left +this.AUSTRALIS_BORDER_WIDTH +borderStart -1;
		}
		
		var bgGradient = (WINNT) ? this.bgGradientWINNT : (DARWIN) ? this.bgGradientDARWIN : this.bgGradientLINUX;
		
		var sscode = '/*The Fox, only better CSS declarations of variable values*/\n';
		sscode += '@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\n';
		sscode += '@-moz-document url("'+document.baseURI+'") {\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-before,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-after {\n';
		sscode += '	  background-color: ' + this.lwtheme.bgColor + ' !important;\n';
		sscode += '	  color: ' + this.lwtheme.color + ' !important;\n';
		sscode += '	  background-repeat: repeat !important;\n';
		sscode += '	  background-size: auto auto !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-before,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-after {\n';
		sscode += '	  background-image: linear-gradient('+((DARWIN) ? bgGradient : 'transparent, transparent')+'), ' + this.lwtheme.bgImage + ' !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-slimmer:not([collapsed]) ~ #'+objName+'-slimChrome-container:not([RSSTicker]):not([topPuzzleBar]) > #'+objName+'-slimChrome-toolbars,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-slimmer:not([collapsed]) ~ #'+objName+'-slimChrome-container:not([RSSTicker]):not([topPuzzleBar]) > #'+objName+'-slimChrome-toolbars-before,\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-slimmer:not([collapsed]) ~ #'+objName+'-slimChrome-container:not([RSSTicker]):not([topPuzzleBar]) > #'+objName+'-slimChrome-toolbars-after {\n';
		sscode += '	  background-image: linear-gradient('+bgGradient+'), ' + this.lwtheme.bgImage + ' !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars {\n';
		sscode += '	  background-position: 0% 0%, '+((RTL) ? 'right' : 'left')+' '+offsetX+'px top '+offsetY+'px !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimStyle="full"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #'+objName+'-slimChrome-toolbars {\n';
		sscode += '	  background-position: 0% 0%, '+((RTL) ? 'right' : 'left')+' '+fullOffsetX+'px top '+offsetY+'px !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimStyle="australis"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) #'+objName+'-slimChrome-toolbars {\n';
		sscode += '	  background-position: 0% 0%, '+((RTL) ? 'right' : 'left')+' '+australisOffsetX+'px top '+offsetY+'px !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-before:-moz-locale-dir(ltr),\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-after:-moz-locale-dir(rtl) {\n';
		sscode += '	  background-position: 0% 0%, '+((RTL) ? 'right' : 'left')+' '+australisOffsetXLeft+'px top '+offsetY+'px !important;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-after:-moz-locale-dir(ltr),\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-toolbars-before:-moz-locale-dir(rtl) {\n';
		sscode += '	  background-position: 0% 0%, '+((RTL) ? 'right' : 'left')+' '+australisOffsetXRight+'px top '+offsetY+'px !important;\n';
		sscode += '	}\n';
		sscode += '}';
		
		Styles.load('personaSlimChrome_'+_UUID, sscode, true);
	},
	
	init: function() {
		// observe when toolbars are added or removed from the container
		this.childObserver = new window.MutationObserver(() => { this.onEnsure(); });
		this.childObserver.observe(slimChrome.toolbars, { childList: true });
		
		// observe when toolbars in the container are enabled or disabled
		this.hiddenObserver = new window.MutationObserver(() => { this.onEnsure(); });
		this.hiddenObserver.observe(slimChrome.toolbars, { attributes: true, attributeFilter: ['hidden', 'collapsed'], subtree: true });
		
		this.apply();
		aSync(() => { this.stylePersona(); }, 1000);
	},
	
	deinit: function() {
		this.childObserver.disconnect();
		this.hiddenObserver.disconnect();
		
		delete slimChrome.container._borderSize;
		delete slimChrome.container._lastWidth;
		delete slimChrome.container._lastHeight;
		
		removeAttribute(gNavToolbox, 'slimStyle');
	}
};

Modules.LOADMODULE = function() {
	Prefs.listen('slimStyle', slimStyle);
	
	Listeners.add(window, 'LoadedSlimChrome', slimStyle);
	Listeners.add(window, 'UnloadingSlimChrome', slimStyle);
	Listeners.add(window, 'MovedSlimChrome', slimStyle);
	Listeners.add(window, 'EnsureSlimChrome', slimStyle);
	
	// support personas in hovering toolbox
	Observers.add(slimStyle, "lightweight-theme-styling-update");
	Observers.add(slimStyle, "lightweight-theme-preview-requested");
	
	slimStyle.apply();
};

Modules.UNLOADMODULE = function() {
	Listeners.remove(window, 'LoadedSlimChrome', slimStyle);
	Listeners.remove(window, 'UnloadingSlimChrome', slimStyle);
	Listeners.remove(window, 'MovedSlimChrome', slimStyle);
	Listeners.remove(window, 'EnsureSlimChrome', slimStyle);
	Observers.remove(slimStyle, "lightweight-theme-styling-update");
	Observers.remove(slimStyle, "lightweight-theme-preview-requested");
	
	Prefs.unlisten('slimStyle', slimStyle);
	
	Styles.unload('slimChromeSVG_'+_UUID);
	
	if(slimStyle.childObserver) {
		slimStyle.childObserver.disconnect();
	}
	if(slimStyle.hiddenObserver) {
		slimStyle.hiddenObserver.disconnect();
	}
	
	removeAttribute(gNavToolbox, 'slimStyle');
};
