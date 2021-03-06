Modules.VERSION = '2.0.2';

this.__defineGetter__('browserPanel', function() { return $('browser-panel'); });
this.__defineGetter__('contentArea', function() { return $('browser'); });
this.__defineGetter__('customToolbars', function() { return $('customToolbars'); });
this.__defineGetter__('TabsToolbar', function() { return $('TabsToolbar'); });
this.__defineGetter__('MenuBar', function() { return $('toolbar-menubar'); });
this.__defineGetter__('PlacesToolbarHelper', function() { return window.PlacesToolbarHelper; });
this.__defineGetter__('PlacesToolbar', function() { return PlacesToolbarHelper._viewElt; });
this.__defineGetter__('tabDropIndicator', function() { return $('tabbrowser-tabs')._tabDropIndicator; });
this.__defineGetter__('gURLBar', function() { return window.gURLBar; });
this.__defineGetter__('gSearchBar', function() { return $('searchbar'); });

this.slimChrome = {
	// until I find a better way of finding out on which side of the browser is the scrollbar, I'm setting equal margins
	MIN_LEFT: 22,
	MIN_RIGHT: 22,
	MIN_WIDTH: 550,
	
	// how much (px) should the active area of the slimmer "extend" on windows with chromehidden~=menubar
	// also affects the main window when Tree Style Tabs is enabled
	EXTEND_CHROMEHIDDEN: 21,
	
	get slimmer () { return $(objName+'-slimChrome-slimmer'); },
	get container () { return $(objName+'-slimChrome-container'); },
	get toolbars () { return $(objName+'-slimChrome-toolbars'); },
	
	_slimAnimation: null,
	get slimAnimation () { return this._slimAnimation || Prefs.slimAnimation; },
	set slimAnimation (v) {
		if(v) {
			Timers.init('resetSlimAnimation', () => {
				this._slimAnimation = null;
			}, 2250);
		}
		this._slimAnimation = v;
		this.animation();
	},
	
	moveStyle: {},
	lastStyle: null,
	initialLoading: true,
	
	receiveMessage: function(m) {
		// +1 is for the ':' after objName
		let name = m.name.substr(objName.length +1);
		
		switch(name) {
			case 'focusPasswords':
				m.target._showMiniBar = m.data;
				
				if(m.target == gBrowser.mCurrentBrowser) {
					this.focusPasswords();
				}
				break;
			
			case 'locationChange':
				m.target._currentHost = m.data.host;
				m.target._currentSpec = m.data.spec;
				
				if(m.target == gBrowser.mCurrentBrowser) {
					this.onTabSelect();
				}
				break;
		}
	},
	
	observe: function(aSubject, aTopic, aData) {
		switch(aSubject) {
			case 'useMouse':
				this.useMouse();
				break;
			
			case 'includeNavBar':
				this.includeNavBar();
				break;
			
			case 'slimAnimation':
				this.animation();
				break;
		}
	},
	
	handleEvent: function(e) {
		switch(e.type) {
			case 'resize':
				this.delayMove();
				break;
			
			case 'blur':
				this.setHover(false);
				break;
			
			case 'focus':
				this.setHover(true, true);
				break;
			
			case 'mouseover':
				// don't show chrome when hovering popups in the menu bar as it's unnecessary and will only look weird
				if(this.isMenuBarPopup(e)) { return; }
				
				// don't show chrome if hovering a widget panel, this will always be a child of nav-bar even if the trigger widget isn't,
				// and the popup code will keep it open in that case; unfortunately I can't actually do this, if the panel opens while the nav-bar is hidden away,
				// it won't be responsive since technically the panel will also be hidden away
				//if(isAncestor(e.target, $('customizationui-widget-panel'))) { return; }
				
				// don't show chrome if something doesn't want it to be shown
				if(!dispatch(this.container, { type: 'WillShowSlimChrome', detail: e })) { return; }
				
				if(trueAttribute(this.container, 'mini') && !trueAttribute(this.container, 'hover') && isAncestor(e.target, this.container)) {
					this.container.hoversQueued++;
					return;
				}
				this.onMouseOver(e);
				break;
			
			case 'mouseout':
				if(this.isMenuBarPopup(e)) { break; }
				
				if(trueAttribute(this.container, 'mini') && !trueAttribute(this.container, 'hover') && isAncestor(e.target, this.container)) {
					this.container.hoversQueued--;
					break;
				}
				this.setHover(false);
				break;
			
			case 'dragenter':
				if(isAncestor(e.target, TabsToolbar)) {
					Watchers.addAttributeWatcher(tabDropIndicator, 'collapsed', this, false, false);
				}
				
				if(isAncestor(e.target, gNavToolbox)) {
					this.setHover(true);
					// no break;
				} else {
					this.onDragExitAll();
					break;
				}
			
			case 'dragstart':
				Listeners.remove(gNavToolbox, 'dragenter', this);
				Listeners.add(gBrowser, "dragenter", this);
				Listeners.add(window, "drop", this);
				Listeners.add(window, "dragend", this);
				break;
			
			case 'drop':
			case 'dragend':
				this.onDragExitAll();
				break;
			
			case 'mousemove':
				this.contentAreaOnMouseMove();
				break;
			
			case 'transitionend':
				if(e.target != this.container) { break; }
				
				var prop1 = 'width';
				switch(this.slimAnimation) {
					case 'fadein':
					case 'slidedown':
						if(!trueAttribute(this.container, 'mini')) {
							prop1 = 'opacity';
						}
						break;
						
					case 'hinge':
						if(!trueAttribute(this.container, 'mini')) {
							prop1 = 'transform';
						}
						break;
						
					default:
						break;
				}
				
				var prop2 = 'opacity';
				if(this.slimAnimation == 'hinge') {
					prop2 = 'transform';
				}
				
				switch(e.propertyName) {
					case prop1:
						this.finishedWidth();
					
					case prop2:
						this.finishedOpacity();
				}
				break;
			
			case 'TabSelect':
				this.onTabSelect(e);
				break;
			
			case 'keydown':
				// only trigger this on keydown if user keeps the key pressed down
				if(!e.repeat) {
					break;
				}
			
			case 'keyup':
				if(e.ctrlKey || e.altKey || e.metaKey // don't trigger for modkeys or any keyboard shortcuts
				|| this.container.hovers == 0 // don't bother of course...
				|| this.initialShowings.size > 0 // the chrome is showing automatically, so make sure it finishes first
				|| (typeof(popups) != 'undefined' && popups.held.size > 0) // don't trigger from keystrokes when there's a popup open
				|| isAncestor(document.commandDispatcher.focusedElement, this.container) // make sure the top chrome isn't focused
				) {
					break;
				}
				
				this.setHover(false, true);
				
				// don't let it keep re-showing if the mouse is over it
				toggleAttribute(this.container, 'noPointerEvents', !trueAttribute(this.container, 'mini') && this.container.hovers == 0);
				break;
		}
	},
	
	browserListener: function(e) {
		switch(e.type) {
			case 'mouseout':
				// bascially this means that when the mouse left something, it entered "nothing", which is what we want to capture here
				if(e.relatedTarget) { break; }
				
				// also, don't capture this if we're in HTML5 fullscreen mode and in Mac OS X, as it's just weird
				if(DARWIN && mozFullScreen) { break; }
				
				if(!document.documentElement.getAttribute('chromehidden').contains('menubar') && dispatch(this.container, { type: 'SlimChromeNormalActiveArea' })) {
					// we also only need to show if the mouse is hovering the toolbox, leaving the window doesn't count
					if(e.screenY < gNavToolbox.boxObject.screenY
					|| e.screenY > gNavToolbox.boxObject.screenY +gNavToolbox.boxObject.height
					|| e.screenX < gNavToolbox.boxObject.screenX
					|| e.screenX > gNavToolbox.boxObject.screenX +gNavToolbox.boxObject.width) { break; }
				} else {
					// in popup windows, we "extend the hover area" by pretending the slimmer is taller than it actually is
					if(e.screenY < this.slimmer.boxObject.screenY -this.EXTEND_CHROMEHIDDEN
					|| e.screenY > this.slimmer.boxObject.screenY
					|| e.screenX < this.slimmer.boxObject.screenX
					|| e.screenX > this.slimmer.boxObject.screenX +this.slimmer.boxObject.width) { break; }
				}
				
				this.onMouseOver();
				
				// don't keep listening to mouseout, otherwise the toolbox would get stuck open
				Listeners.remove(browserPanel, 'mouseout', this.browserListener);
				Listeners.add(browserPanel, 'mouseover', this.browserListener);
				break;
			
			case 'mouseover':
				// no need to check for target here, if we're entering something, there's always "something" to enter, so the other handlers can take care of it
				this.setHover(false);
				
				// stop this listener, or the toolbox would be stuck close otherwise, and start listening for mouseout again
				Listeners.remove(browserPanel, 'mouseover', this.browserListener);
				Listeners.add(browserPanel, 'mouseout', this.browserListener);
				break;
			
			case 'keydown':
				// we're only interested in the esc key in the location bar and the search bar when in our chrome container
				if(!e.target
				|| e.keyCode != e.DOM_VK_ESCAPE
				|| (e.target.nodeName != 'textbox' && e.target.nodeName != 'searchbar')
				|| !isAncestor(e.target, this.container)
				|| e.defaultPrevented) {
					break;
				}
				
				// if esc will do something in the urlbar, let it do its thing
				if(e.target == gURLBar) {
					if(gURLBar.valueIsTyped || (gURLBar.popup && gURLBar.popup.state == 'open')) { break; }
					
					// we need the "original" value so we can compare with the current value,
					// we can only do this by mimicking what happens in URLBarSetURI()
					var uri = gBrowser.currentURI;
					// Strip off "wyciwyg://" and passwords for the location bar
					try { uri = Services.uriFixup.createExposableURI(uri); }
					catch(ex) {}
					
					// Replace initial page URIs with an empty string
					// only if there's no opener (bug 370555).
					// Bug 863515 - Make content.opener checks work in electrolysis.
					if(window.gInitialPages.indexOf(uri.spec) != -1) {
						var value = !window.gMultiProcessBrowser && window.content.opener ? uri.spec : "";
					} else {
						var value = window.losslessDecodeURI(uri);
					}
					
					// we need to check ._value, as .value goes through a whole lot more processing which is unnecessary to check for here
					if(gURLBar._value != value || gURLBar.mController.handleEscape()) { break; }
				}
				
				// let it also close the search bar's suggestions popup before we hide the chrome
				if(e.target == gSearchBar && $('PopupAutoComplete').state == 'open') { break; }
				
				// .blur() doesn't work so...
				if(window.focusNextFrame) {
					window.focusNextFrame(e);
				} else if(window.content) {
					window.content.focus();
				} else {
					gBrowser.mCurrentBrowser.focus();
				}
				
				this.setHover(false, true);
				e.preventDefault();
				e.stopPropagation();
				
				// don't let it keep re-showing if the mouse is over it
				toggleAttribute(this.container, 'noPointerEvents', !trueAttribute(this.container, 'mini') && this.container.hovers == 0);
				break;
		}
	},
	
	attrWatcher: function(obj, attr, oldVal, newVal) {
		switch(obj) {
			case tabDropIndicator:
				toggleAttribute(gNavToolbox, 'dropIndicatorFix', !tabDropIndicator.collapsed);
				break;
			
			case $('sidebar-box'):
				if(oldVal != newVal) {
					this.delayMove();
				}
				break;
		}
	},
	
	onWidgetAfterDOMChange: function(aNode, aNextNode, aContainer, aWasRemoval) {
		if(!this.initialLoading && isAncestor(aContainer, this.toolbars) && !trueAttribute(this.container, 'hover')) {
			var toolbar = aContainer;
			while(toolbar.nodeName != 'toolbar' && toolbar.parentNode) {
				toolbar = toolbar.parentNode;
			}
			if(!toolbar.collapsed) {
				this.initialShow();
			}
		}
	},
	
	// delayMoveSlimChrome
	delayMove: function() {
		Timers.init('delayMoveSlimChrome', () => { this.move(); }, 0);
	},
	
	shouldReMove: function(newStyle) {
		if(!this.lastStyle) { return true; }
		
		if(!newStyle) {
			return (this.container.clientWidth != this.lastStyle.clientWidth);
		}
		else if(newStyle.right != this.lastStyle.right
			|| newStyle.left != this.lastStyle.left
			|| newStyle.width != this.lastStyle.width
			|| newStyle.clientWidth != this.lastStyle.clientWidth) {
				return true;
		}
		
		return false;
	},
	
	// Handles the position of the top chrome
	move: function() {
		this.moveStyle = {
			width: -this.MIN_RIGHT -this.MIN_LEFT,
			clientWidth: this.container.clientWidth,
			left: this.MIN_LEFT,
			right: this.MIN_RIGHT
		};
		
		var appContentPos = $('content').getBoundingClientRect();
		this.moveStyle.width += appContentPos.width;
		this.moveStyle.left += appContentPos.left;
		this.moveStyle.right += document.documentElement.clientWidth -appContentPos.right;
		
		// Compatibility with TreeStyleTab
		if(TabsToolbar && !TabsToolbar.collapsed && TabsToolbar.getAttribute('treestyletab-tabbar-autohide-state') != 'hidden') {
			// This is also needed when the tabs are on the left, the width of the findbar doesn't follow with the rest of the window for some reason
			if(TabsToolbar.getAttribute('treestyletab-tabbar-position') == 'left' || TabsToolbar.getAttribute('treestyletab-tabbar-position') == 'right') {
				var TabsSplitter = document.getAnonymousElementByAttribute($('content'), 'class', 'treestyletab-splitter');
				this.moveStyle.width -= TabsToolbar.clientWidth;
				this.moveStyle.width -= TabsSplitter.clientWidth +(TabsSplitter.clientLeft *2);
				if(TabsToolbar.getAttribute('treestyletab-tabbar-position') == 'left') {
					this.moveStyle.left += TabsToolbar.clientWidth;
					this.moveStyle.left += TabsSplitter.clientWidth +(TabsSplitter.clientLeft *2);
				}
				if(TabsToolbar.getAttribute('treestyletab-tabbar-position') == 'right') {
					this.moveStyle.right += TabsToolbar.clientWidth;
					this.moveStyle.right += TabsSplitter.clientWidth +(TabsSplitter.clientLeft *2);
				}
			}
		}
		
		this.moveStyle.fullWidth = Math.max(this.moveStyle.width +this.MIN_RIGHT +this.MIN_LEFT, 100);
		this.moveStyle.fullLeft = this.moveStyle.left -this.MIN_LEFT;
		this.moveStyle.fullRight = this.moveStyle.right -this.MIN_RIGHT;
		
		this.moveStyle.width = Math.max(this.moveStyle.width, 100);
		
		if(!this.shouldReMove(this.moveStyle)) { return; }
		this.lastStyle = this.moveStyle;
		
		var sscode = '/*The Fox, Only Better CSS declarations of variable values*/\n';
		sscode += '@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\n';
		sscode += '@-moz-document url("'+document.baseURI+'") {\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container:-moz-locale-dir(ltr) {\n';
		sscode += '		left: ' + this.moveStyle.left + 'px;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container:-moz-locale-dir(rtl) {\n';
		sscode += '		right: ' + this.moveStyle.right + 'px;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container {\n';
		sscode += '		width: ' + this.moveStyle.width + 'px;\n';
		sscode += '	}\n';
		
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimStyle="full"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])):-moz-locale-dir(ltr) {\n';
		sscode += '		left: ' + this.moveStyle.fullLeft + 'px;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimStyle="full"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])):-moz-locale-dir(rtl) {\n';
		sscode += '		right: ' + this.moveStyle.fullRight + 'px;\n';
		sscode += '	}\n';
		
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container[onlyURLBar]:-moz-locale-dir(ltr):not([miniSideSwitch]),\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container[onlyURLBar]:-moz-locale-dir(rtl)[miniSideSwitch] {\n';
		sscode += '		left: ' + this.moveStyle.left + 'px;\n';
		sscode += '		right: auto;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container[onlyURLBar]:-moz-locale-dir(rtl):not([miniSideSwitch]),\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #'+objName+'-slimChrome-container[onlyURLBar]:-moz-locale-dir(ltr)[miniSideSwitch] {\n';
		sscode += '		left: auto;\n';
		sscode += '		right: ' + this.moveStyle.right + 'px;\n';
		sscode += '	}\n';
		
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimStyle="full"] #'+objName+'-slimChrome-container:-moz-any([hover],:not([onlyURLBar])) {\n';
		sscode += '		width: ' + this.moveStyle.fullWidth + 'px;\n';
		sscode += '	}\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox:not([slimAnimation="rollout"]) #'+objName+'-slimChrome-container:not([hover])[onlyURLBar],\n';
		sscode += '	window['+objName+'_UUID="'+_UUID+'"] #navigator-toolbox[slimAnimation="rollout"] #'+objName+'-slimChrome-container:not([hover]) {\n';
		sscode += '		width: ' + Math.min(this.moveStyle.width, this.MIN_WIDTH) + 'px;\n';
		sscode += '	}\n';
		sscode += '}';
		
		Styles.load('slimChromeMove_'+_UUID, sscode, true);
		
		dispatch(this.container, { type: 'MovedSlimChrome', cancelable: false });
	},
	
	miniSideSwitch: function(v) {
		toggleAttribute(this.container, 'miniSideSwitch', v);
	},
	
	isMenuBarPopup: function(e) {
		var node = e.originalTarget;
		
		// we don't want the chrome to show or hide when hovering the menu popups from the menu bar
		var toolbars = [MenuBar, TabsToolbar];
		
		// if we're not including the nav-bar in the container, might as well apply the same rule to it
		if(!Prefs.includeNavBar) {
			toolbars.push(gNavBar);
		}
		
		for(let toolbar of toolbars) {
			if(isAncestor(node, toolbar)) {
				var parent = node;
				while(parent) {
					if(parent == toolbar) { break; }
					if(parent.localName == 'menupopup') { return true; }
					
					// the searchbar's engine selection popup is a bit of a special case; the mouseover events repeat for the actual searchbar
					if(parent.localName == 'searchbar' && e.type == 'mouseover') {
						var searchPopup = document.getAnonymousElementByAttribute(parent, 'anonid', 'searchbar-popup');
						if(searchPopup.state == 'open') {
							if(e.screenY >= searchPopup.boxObject.screenY
							&& e.screenY <= searchPopup.boxObject.screenY +searchPopup.boxObject.height
							&& e.screenX >= searchPopup.boxObject.screenX
							&& e.screenX <= searchPopup.boxObject.screenX +searchPopup.boxObject.width) { return true; }
						}
					}
					
					parent = parent.parentNode;
				}
			}
		}
		
		return false;
	},
	
	onMouseOver: function(e) {
		this.setHover(true, e && isAncestor(e.target, this.container));
	},
	
	onDragExitAll: function() {
		Listeners.add(gNavToolbox, 'dragenter', this);
		Listeners.remove(gBrowser, "dragenter", this);
		Listeners.remove(window, "drop", this);
		Listeners.remove(window, "dragend", this);
		this.setHover(false);
	},
	
	setHover: function(hover, now, force) {
		if(!this.container) { return; } // on disabling?...
		
		if(hover) {
			this.container.hovers++;
			
			if(!now) {
				Timers.init('setHover', () => {
					this.hoverTrue();
				}, Prefs.delayIn);
			} else {
				Timers.cancel('setHover');
				this.hoverTrue();
			}
			
			if(force !== undefined && typeof(force) == 'number') {
				this.container.hovers = force;
			}
		}
		else {
			if(force !== undefined && typeof(force) == 'number') {
				this.container.hovers = force;
			} else if(this.container.hovers > 0) {
				this.container.hovers--;
			}
			
			if(this.container.hovers == 0) {
				Timers.init('setHover', () => {
					this.out();
					removeAttribute(this.container, 'fullWidth');
					removeAttribute(this.container, 'hover');
					this.ensureFinishedOpacity();
					Listeners.remove(contentArea, 'mousemove', this);
					this.contentAreaMovedReset();
				}, (!now) ? Prefs.delayOut : 0);
			}
		}
	},
	
	hoverTrue: function() {
		this.in();
		setAttribute(this.container, 'hover', 'true');
		setAttribute(gNavToolbox, 'slimChromeVisible', 'true');
		this.ensureFinishedWidth();
		
		// safeguard against the chrome getting stuck sometimes when I can't control it
		this.contentAreaMovedReset();
		Listeners.add(contentArea, 'mousemove', this);
	},
	
	contentAreaMouseMoved: false,
	contentAreaMovedReset: function() {
		Timers.cancel('contentAreaMouseMoved');
		this.contentAreaMouseMoved = false;
	},
	
	contentAreaOnMouseMove: function() {
		// no need to keep doing all the routine on each event and lag the browser, it will happen when it happens
		if(this.contentAreaMouseMoved) { return; }
		this.contentAreaMouseMoved = true;
		Timers.init('contentAreaMouseMoved', () => {
			// sometimes a popup can close or hide without triggering a popuphidden, or without being removed from the array. No idea why or exactly what happens...
			// I've seen this with PopupAutoCompleteRichResult.
			for(let popup of popups.held) {
				if(!popup.open && popup.state != 'open') {
					popups.held.delete(popup);
				}
			}
			
			if(this.container.hovers > 0 // no point if it's already supposed to hide
			&& this.initialShowings.size == 0 // don't hide if timers are active
			&& !isAncestor(document.commandDispatcher.focusedElement, this.container) // make sure the top chrome isn't focused
			&& popups.held.size == 0 // a popup could be holding it open
			&& (!Prefs.useMouse || !$$('#navigator-toolbox:hover')[0]) // trick to find out if the mouse is hovering the chrome
			) {
				// if we get here, nothing is holding the chrome open, so it's likely that it should be hidden, but wasn't for some reason
				this.setHover(false, true, 0);
				return;
			}
			
			this.contentAreaMouseMoved = false;
		}, 500);
	},
	
	setMini: function(mini) {
		if(!Prefs.includeNavBar) { return; }
		
		dispatch(this.container, { type: 'willSetMiniChrome', cancelable: false, detail: mini });
		
		if(mini) {
			Timers.cancel('onlyURLBar');
			Timers.cancel('setMini');
			this.in();
			setAttribute(this.container, 'mini', 'true');
			setAttribute(this.container, 'onlyURLBar', 'true');
			setAttribute(gNavToolbox, 'slimChromeVisible', 'true');
		} else {
			// aSync so the toolbox focus handler knows what it's doing
			Timers.init('setMini', () => {
				this.out();
				removeAttribute(this.container, 'mini');
				
				if(!trueAttribute(this.container, 'hover')) {
					// don't hover the chrome if the mini bar is hiding and the mouse happens to be hovering it
					setAttribute(this.container, 'noPointerEvents', 'true');
					
					// reset this counter, so the chrome doesn't get stuck the next time it opens
					this.container.hoversQueued = 0;
				}
				
				// let chrome hide completely before showing the rest of the UI
				Timers.init('onlyURLBar', () => {
					removeAttribute(this.container, 'onlyURLBar');
					toggleAttribute(gNavToolbox, 'slimChromeVisible', trueAttribute(this.container, 'hover'));
				}, this.slimAnimation == 'hinge' ? 500 : 300);
			}, 50);
		}
	},
	
	focusPasswords: function() {
		if(Prefs.includeNavBar && (typeof(popups) == 'undefined' || !popups.blocked)) {
			this.setMini(gBrowser.mCurrentBrowser._showMiniBar);
			return gBrowser.mCurrentBrowser._showMiniBar;
		}
		return false;
	},
	
	in: function() {
		setAttribute(this.container, 'in', 'true');
		removeAttribute(this.container, 'out');
	},
	
	out: function() {
		setAttribute(this.container, 'out', 'true');
		removeAttribute(this.container, 'in');
	},
	
	finishedWidth: function() {
		Timers.cancel('ensureSlimChromeFinishedWidth');
		
		if(trueAttribute(this.container, 'hover')) {
			// make sure it doesn't get stuck open
			// also account for any initial timers still running
			this.setHover(true, false, Math.max(1, this.initialShowings.size));
			
			// account for queued hovers while in mini mode
			if(this.container.hoversQueued) {
				this.container.hovers += this.container.hoversQueued;
				this.container.hoversQueued = 0;
			}
			
			setAttribute(this.container, 'fullWidth', 'true');
			
			// update the Places Toolbar, so its items are distributed correclty
			var placesInToolbar = PlacesToolbarHelper._getParentToolbar(PlacesToolbar);
			if(isAncestor(placesInToolbar, this.container) && !placesInToolbar.collapsed) {
				// don't block the rest in case this goes wrong
				try { PlacesToolbar._placesView.updateOverflowStatus(); }
				catch(ex) { Cu.reportError(ex); }
			}
			
			// update the NavBar, so its items are distributed correctly
			if(gNavBar.overflowable) {
				gNavBar.overflowable._onResize();
				gNavBar.overflowable._lazyResizeHandler.finalize().then(() => {
					gNavBar.overflowable._lazyResizeHandler = null;
					dispatch(this.container, { type: 'FinishedSlimChromeWidth', cancelable: false });
				});
			}
			else {
				dispatch(this.container, { type: 'FinishedSlimChromeWidth', cancelable: false });
			}
		}
	},
	
	// in case the width doesn't change, we need to make sure transitioning from mini mode to full mode doesn't hide the chrome when mousing out
	ensureFinishedWidth: function() {
		if(trueAttribute(this.container, 'fullWidth')) { return; }
		
		dispatch(this.container, { type: 'EnsureSlimChrome', cancelable: false });
		
		if(this.slimAnimation == 'none' || this.lastStyle.width <= this.MIN_WIDTH) {
			this.finishedWidth();
		} else {
			// for the extremelly rare cases where neither the above condition is true or when the animation doesn't need to take place (e.g. extremelly well placed clicks)
			Timers.init('ensureSlimChromeFinishedWidth', () => { this.finishedWidth(); }, 400);
		}
	},
	
	ensureFinishedOpacity: function() {
		if(this.slimAnimation == 'none') {
			this.finishedOpacity();
		}
	},
	
	finishedOpacity: function() {
		var visible = trueAttribute(this.container, 'hover') || trueAttribute(this.container, 'mini');
		toggleAttribute(this.container, 'noPointerEvents', !visible);
		toggleAttribute(gNavToolbox, 'slimChromeVisible', visible);
	},
	
	onTabSelect: function(e) {
		if(Prefs.includeNavBar // if the nav bar isn't in our container, all this is useless
		&& !this.focusPasswords() // focusPasswords will always show mini if a password field is focused
		&& (	(Prefs.miniOnChangeLocation && gBrowser.mCurrentBrowser._lastHost != gBrowser.mCurrentBrowser._currentHost) // only if miniOnChangeLocation and the webhost has changed
			|| (e && Prefs.miniOnTabSelect) ) // or when supposed to show on every tab select (and this is actually a TabSelect event)
		&& (typeof(popups) == 'undefined' || !popups.blocked) // mini is already shown if a popup is blocking it open; we shouldn't close it here in a bit either
		&& !trueAttribute(this.container, 'hover') // also no point in showing mini if chrome is already shown
		&& !gBrowser.selectedTab.pinned // and if it's not a pinned tab
		&& window.XULBrowserWindow.inContentWhitelist.indexOf(gBrowser.mCurrentBrowser._currentSpec) == -1 // and if the current address is not whitelisted
		) {
			this.setMini(true);
			Timers.init('setMini', () => { this.hideMiniInABit(); }, 2000);
			gBrowser.mCurrentBrowser._lastHost = gBrowser.mCurrentBrowser._currentHost;
			return true;
		}
		
		gBrowser.mCurrentBrowser._lastHost = gBrowser.mCurrentBrowser._currentHost;
		return false;
	},
	
	hideMiniInABit: function() {
		if(!Prefs.includeNavBar) { return; }
		
		// don't hide mini if we're hovering it
		if(this.container.hoversQueued > 0 && !trueAttribute(this.container, 'hover')) {
			Timers.init('setMini', () => { this.hideMiniInABit(); }, 1000);
			return;
		}
		
		this.setMini(false);
	},
	
	initialShowings: new Set(),
	initialShow: function(delay) {
		this.setHover(true);
		
		// Taking this from TPP, making the same assumptions.
		// don't use Timers, because if we use multiple initialShow()'s it could get stuck open
		// we keep a reference to the timer, because otherwise sometimes it would not trigger (go figure...), hopefully this helps with that
		var thisShowing = aSync(() => {
			if(this.initialShowings.has(thisShowing)) {
				this.initialShowings.delete(thisShowing);
			}
			
			this.setHover(false);
		}, delay || 3000);
		this.initialShowings.add(thisShowing);
	},
	
	childObserver: null,
	childHandler: function(mutations) {
		for(let m of mutations) {
			if(m.addedNodes) {
				for(let n of m.addedNodes) {
					if(slimChromeExceptions.has(n.id)) { continue; }
					if(n.nodeName != 'toolbar') { continue; }
					
					var prevSibling = n.previousSibling;
					while(prevSibling) {
						if(prevSibling == customToolbars) {
							this.toolbars.appendChild(n);
							if(gNavToolbox.externalToolbars.indexOf(n) == -1) {
								gNavToolbox.externalToolbars.push(n);
							}
							break;
						}
						prevSibling = prevSibling.previousSibling;
					}
				}
			}
		}
	},
	
	getParentWithId: function(node) {
		while(node && !node.id) {
			node = node.parentNode;
		}
		return node;
	},
	
	useMouse: function() {
		if(Prefs.useMouse) {
			// keep the toolbox when hovering it
			Listeners.add(gNavToolbox, 'dragstart', this);
			Listeners.add(gNavToolbox, 'dragenter', this);
			Listeners.add(gNavToolbox, 'mouseover', this);
			Listeners.add(gNavToolbox, 'mouseout', this);
			
			// the empty area of the tabs toolbar doesn't respond to mouse events, so we need to use mouseout from the browser-panel instead
			Listeners.add(browserPanel, 'mouseout', this.browserListener);
		} else {
			Listeners.remove(gNavToolbox, 'dragstart', this);
			Listeners.remove(gNavToolbox, 'dragenter', this);
			Listeners.remove(gNavToolbox, 'mouseover', this);
			Listeners.remove(gNavToolbox, 'mouseout', this);
			Listeners.remove(browserPanel, 'mouseout', this.browserListener);
		}
	},
	
	includeNavBar: function(unload) {
		if(!unload && Prefs.includeNavBar && !isAncestor(gNavBar, this.container)) {
			this.toolbars.insertBefore(gNavBar, this.toolbars.firstChild);
			
			// the nav-bar really shouldn't over- or underflow when it's hidden, as it doesn't have its real width
			this.initOverflowable(gNavBar);
		}
		else if((unload || !Prefs.includeNavBar) && isAncestor(gNavBar, this.container)) {
			this.deinitOverflowable(gNavBar);
			
			// don't trigger a re-register of this toolbar node with CUI when it's not needed
			if(window.closed || window.willClose) {
				Overlays.safeMoveToolbar(gNavBar, gNavToolbox, this.slimmer || customToolbars);
			} else {
				gNavToolbox.insertBefore(gNavBar, this.slimmer || customToolbars);
			}
		}
		
		hideIt(this.slimmer, Prefs.includeNavBar);
	},
	
	initOverflowable: function(toolbar) {
		if(!toolbar.overflowable) { return; }
		
		Piggyback.add('slimChrome', toolbar.overflowable, '_onLazyResize', () => {
			return trueAttribute(this.container, 'fullWidth');
		}, Piggyback.MODE_BEFORE);
		Piggyback.add('slimChrome', toolbar.overflowable, 'onOverflow', () => {
			return trueAttribute(this.container, 'fullWidth');
		}, Piggyback.MODE_BEFORE);
		Piggyback.add('slimChrome', toolbar.overflowable, '_moveItemsBackToTheirOrigin', () => {
			return trueAttribute(this.container, 'fullWidth');
		}, Piggyback.MODE_BEFORE);
		
		if(toolbar.overflowable._lazyResizeHandler) {
			toolbar.overflowable._lazyResizeHandler.disarm();
			toolbar.overflowable._lazyResizeHandler = null;
		}
	},
	
	deinitOverflowable: function(toolbar) {
		if(!toolbar.overflowable) { return; }
		
		Piggyback.revert('slimChrome', toolbar.overflowable, '_onLazyResize');
		Piggyback.revert('slimChrome', toolbar.overflowable, 'onOverflow');
		Piggyback.revert('slimChrome', toolbar.overflowable, '_moveItemsBackToTheirOrigin');
		
		if(toolbar.overflowable._lazyResizeHandler) {
			toolbar.overflowable._lazyResizeHandler.disarm();
			toolbar.overflowable._lazyResizeHandler = null;
		}
	},
	
	animation: function() {
		setAttribute(gNavToolbox, 'slimAnimation', this.slimAnimation);
	},
	
	// make sure the currently focused element stays focused after initializing
	_focusedElement: null,
	refocusElement: function() {
		// do async because sometimes it wouldn't resize the chrome properly, so let it animate everything as it normally would
		aSync(() => {
			if(this._focusedElement && !isAncestor(document.commandDispatcher.focusedElement, this._focusedElement) && isAncestor(this._focusedElement, this.container)) {
				this._focusedElement.focus();
				
				// sometimes it won't focus the location bar during startup, so just keep trying until it does
				if(!isAncestor(document.commandDispatcher.focusedElement, this._focusedElement)) {
					this.refocusElement();
					return;
				}
				
				this._focusedElement = null;
			}
		}, 50);
	},
	
	onLoad: function() {
		// we get only a node with an id so that for example if the location bar is focused (most common case),
		// we don't get its anonymous nodes that get destroyed in this process.
		this._focusedElement = this.getParentWithId(document.commandDispatcher.focusedElement);
		
		this.container.hovers = 0;
		this.container.hoversQueued = 0;
		
		// prepare PlacesToolbar methods to work in our chrome in case it's there,
		// we don't want it to over/underflow while the bar isn't maximized because that's not its real width.
		// Can't use Piggyback here, it won't work (for some reason...): https://github.com/Quicksaver/The-Fox--Only-Better/issues/83
		window.PlacesToolbar.prototype.__onOverflow = window.PlacesToolbar.prototype._onOverflow;
		window.PlacesToolbar.prototype.__onUnderflow = window.PlacesToolbar.prototype._onUnderflow;
		window.PlacesToolbar.prototype._onOverflow = function() {
			if(typeof(slimChrome) != 'undefined' && isAncestor(PlacesToolbar, slimChrome.container) && !trueAttribute(slimChrome.container, 'fullWidth')) { return; }
			this.__onOverflow();
		};
		window.PlacesToolbar.prototype._onUnderflow = function() {
			if(typeof(slimChrome) != 'undefined' && isAncestor(PlacesToolbar, slimChrome.container) && !trueAttribute(slimChrome.container, 'fullWidth')) { return; }
			this.__onUnderflow();
		};
		
		if(PlacesToolbar && PlacesToolbar._placesView) {
			PlacesToolbar._placesView.uninit();
		}
		
		// should we append the nav-bar?
		Prefs.listen('includeNavBar', this);
		this.includeNavBar();
		
		// also append all other custom toolbars
		var toolbar = customToolbars;
		while(toolbar.nextSibling) {
			toolbar = toolbar.nextSibling;
			if(slimChromeExceptions.has(toolbar.id)) { continue; }
			if(toolbar.nodeName != 'toolbar') { continue; }
			
			var toMove = toolbar;
			toolbar = toolbar.previousSibling;
			this.toolbars.appendChild(toMove);
			
			this.initOverflowable(toMove);
			
			if(gNavToolbox.externalToolbars.indexOf(toMove) == -1) {
				gNavToolbox.externalToolbars.push(toMove);
			}
		}
		
		// re-initialized the Places Toolbar
		PlacesToolbarHelper.init();
		
		// make sure the urlbar keeps its value
		window.URLBarSetURI();
		
		// should the toolbars react to mouse events
		Prefs.listen('useMouse', this);
		this.useMouse();
		
		// position the top chrome correctly when the window is resized or a toolbar is shown/hidden
		Listeners.add(window, 'resize', this);
		
		// make sure the chrome position is updated when toggling the sidebar
		Watchers.addAttributeWatcher($('sidebar-box'), 'hidden', this, false, false);
		Watchers.addAttributeWatcher($('sidebar-box'), 'collapsed', this, false, false);
		
		// also keep the toolbox visible if it has focus of course
		Listeners.add(gNavToolbox, 'focus', this, true);
		Listeners.add(gNavToolbox, 'blur', this, true);
		
		// show mini when the current tab changes host
		Messenger.listenWindow(window, 'locationChange', this);
		
		// show mini chrome when focusing password fields
		Messenger.listenWindow(window, 'focusPasswords', this);
		Listeners.add(gBrowser.tabContainer, 'TabSelect', this);
		
		// hide chrome when typing in content
		Listeners.add(gBrowser, 'keydown', this, true);
		Listeners.add(gBrowser, 'keyup', this, true);
		
		// hide chrome when hitting esc key in the location bar or search bar,
		// can't set the listener directly on the target node because the search bar may not exist yet when the document is created (depends on its placement),
		// also other add-ons can add textboxes, and in theory we want the same behavior with them as well.
		Listeners.add(window, 'keydown', this.browserListener, true);
		
		// re-do widgets positions after resizing
		Listeners.add(this.container, 'transitionend', this);
		
		// make the drop indicator visible on windows with aero enabled;
		// the indicator comes from the binding, and if for some reason it's removed/re-applied, we would lose this watcher, so we need to make sure it stays
		if(WINNT) {
			Listeners.add(TabsToolbar, 'dragenter', this);
		}
		
		// follow changes to chrome toolbars, in case they're in our box and it should be shown
		CustomizableUI.addListener(this);
		
		// make sure we move any toolbars are added after slimChrome is enabled
		this.childObserver = new window.MutationObserver((mutations, observer) => { this.childHandler(mutations, observer); });
		this.childObserver.observe(gNavToolbox, { childList: true });
		
		// set the animation style
		Prefs.listen('slimAnimation', this);
		this.animation();
		
		// no point in showing on customization changes if it's still finishing initializing, there's a lot of these events here
		// 5 second should be enough
		Timers.init('waitCUI', () => {
			this.initialLoading = false;
		}, 5000);
		
		this.refocusElement();
		
		dispatch(this.container, { type: 'LoadedSlimChrome', cancelable: false });
		
		this.move();
	},
	
	onUnload: function() {
		// kill all the timers first, so they don't cause any (harmless) messages in the console
		Timers.cancel('waitCUI');
		Timers.cancel('setHover');
		Timers.cancel('setMini');
		Timers.cancel('onlyURLBar');
		Timers.cancel('contentAreaMouseMoved');
		Timers.cancel('delayMoveSlimChrome');
		Timers.cancel('ensureSlimChromeFinishedWidth');
		
		dispatch(this.container, { type: 'UnloadingSlimChrome', cancelable: false });
		
		var focused = isAncestor(document.commandDispatcher.focusedElement, this.container) && this.getParentWithId(document.commandDispatcher.focusedElement);
		
		Listeners.remove(window, 'resize', this);
		Watchers.removeAttributeWatcher($('sidebar-box'), 'hidden', this, false, false);
		Watchers.removeAttributeWatcher($('sidebar-box'), 'collapsed', this, false, false);
		Listeners.remove(browserPanel, 'mouseout', this.browserListener);
		Listeners.remove(browserPanel, 'mouseover', this.browserListener);
		Listeners.remove(gNavToolbox, 'dragstart', this);
		Listeners.remove(gNavToolbox, 'dragenter', this);
		Listeners.remove(gNavToolbox, 'mouseover', this);
		Listeners.remove(gNavToolbox, 'mouseout', this);
		Listeners.remove(gBrowser, "dragenter", this);
		Listeners.remove(window, "drop", this);
		Listeners.remove(window, "dragend", this);
		Listeners.remove(gNavToolbox, 'focus', this, true);
		Listeners.remove(gNavToolbox, 'blur', this, true);
		Listeners.remove(gBrowser, 'keydown', this, true);
		Listeners.remove(gBrowser, 'keyup', this, true);
		Listeners.remove(window, 'keydown', this.browserListener, true);
		Listeners.remove(this.container, 'transitionend', this);
		Listeners.remove(TabsToolbar, 'dragenter', this);
		Listeners.remove(contentArea, 'mousemove', this);
		Listeners.remove(gBrowser.tabContainer, 'TabSelect', this);
		Messenger.unlistenWindow(window, 'locationChange', this);
		Messenger.unlistenWindow(window, 'focusPasswords', this);
		CustomizableUI.removeListener(this);
		this.childObserver.disconnect();
		
		Prefs.unlisten('useMouse', this);
		Prefs.unlisten('slimAnimation', this);
		
		this.initialLoading = true;
		
		removeAttribute(gNavToolbox, 'slimAnimation');
		removeAttribute(gNavToolbox, 'dropIndicatorFix');
		Watchers.removeAttributeWatcher(tabDropIndicator, 'collapsed', this, false, false);
		
		// reset this before we move the toolbar
		window.PlacesToolbar.prototype._onOverflow = window.PlacesToolbar.prototype.__onOverflow;
		window.PlacesToolbar.prototype._onUnderflow = window.PlacesToolbar.prototype.__onUnderflow;
		delete window.PlacesToolbar.prototype.__onOverflow;
		delete window.PlacesToolbar.prototype.__onUnderflow;
		
		if(PlacesToolbar && PlacesToolbar._placesView) {
			PlacesToolbar._placesView.uninit();
		}
		
		Prefs.unlisten('includeNavBar', this);
		this.includeNavBar(true);
		
		while(this.toolbars.firstChild) {
			var e = gNavToolbox.externalToolbars.indexOf(this.toolbars.firstChild);
			if(e != -1) {
				gNavToolbox.externalToolbars.splice(e, 1);
			}
			
			this.deinitOverflowable(this.toolbars.firstChild);
			
			// don't trigger a re-register of this toolbar node with CUI when it's not needed
			if(window.closed || window.willClose) {
				Overlays.safeMoveToolbar(this.toolbars.firstChild, gNavToolbox);
			} else {
				gNavToolbox.appendChild(this.toolbars.firstChild);
			}
		}
		
		PlacesToolbarHelper.init();
		window.URLBarSetURI();
		
		if(focused && !isAncestor(document.commandDispatcher.focusedElement, focused)) {
			focused.focus();
		}
	}
};
	
this.toggleSkyLights = function() {
	Modules.loadIf('skyLights', Prefs.skyLights && Prefs.includeNavBar);
};

Modules.LOADMODULE = function() {
	slimChrome.browserListener = slimChrome.browserListener.bind(slimChrome);
	
	Messenger.loadInWindow(window, 'slimChrome');
	
	Overlays.overlayWindow(window, 'slimChrome', slimChrome);
	
	Prefs.listen('skyLights', toggleSkyLights);
	Prefs.listen('includeNavBar', toggleSkyLights);
	
	Modules.load('slimStyle');
	toggleSkyLights();
};

Modules.UNLOADMODULE = function() {
	Prefs.unlisten('skyLights', toggleSkyLights);
	Prefs.unlisten('includeNavBar', toggleSkyLights);
	
	Modules.unload('skyLights');
	Modules.unload('slimStyle');
	
	Styles.unload('personaSlimChrome_'+_UUID);
	Overlays.removeOverlayWindow(window, 'slimChrome');
	
	// send this here so the nodes don't exist anymore when handling the event
	dispatch(gNavToolbox, { type: 'UnloadedSlimChrome', cancelable: false });
	
	for(let browser of gBrowser.browsers) {
		delete browser._showMiniBar;
		delete browser._currentHost;
		delete browser._currentSpec;
		delete browser._lastHost;
	}
	
	Messenger.unloadFromWindow(window, 'slimChrome');
};
