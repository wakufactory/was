//WabAudio wrapper
//  by wakufactory 

class Synth {
	constructor(opt) {
		if(!window.AudioContext ) {
			this.error = true; 
			return ;
		}
		this.ctx = new window.AudioContext() ;
		this.mg = this.ctx.createGain() ;
		this.mg.gain.value = 0.6 ;
		this.innode = this.mg ;
		if(opt && opt.analyse) {
			this.analyser = this.ctx.createAnalyser() ;	
			this.analyser.connect(this.mg) ;
			this.analyser.smoothingTimeConstant =0
			this.innode = this.analyser
		}
		if(opt && opt.tone) {
			this.bass = this.ctx.createBiquadFilter() ;
			this.bass.type = "lowshelf" ;
			this.bass.frequency.value = 500 ;
			this.bass.gain.value = 5.0 ;
			this.treble = this.ctx.createBiquadFilter() ;
			this.treble.type = "highshelf" ;
			this.treble.frequency.value = 2000 ;
			this.treble.gain.value = 5.0 ;
			this.bass.connect(this.treble) ;
			this.treble.connect(this.innode) ;
			this.innode = this.bass ;
		}
		if(opt && opt.comp) {
			this.comp = this.ctx.createDynamicsCompressor();
			this.comp.connect(this.innode) ;
			this.innode = this.comp ;
		}
		this.mg.connect(this.ctx.destination) ;
		this.queue = [] 
		
		this.intval = 20 
		this.dtime = 80/1000 ;
		let last = 0
		let qq = null	
		const frame = (time)=> {
//			console.log(this.queue.length)
			let t = this.ctx.currentTime
			const nq = []
			for(let q of this.queue) {
				if(q.time < t+this.dtime) {
					if(q.note)	 {
						q.ongn.note(q.note,q.len,q.time) ;
						qq = q.ongn
					}
					if(q.loop) {	//loop callback
						q.loop(t)
					}
				} else nq.push(q) ;
			}
			this.queue = nq ;
//			requestAnimationFrame(frame)
//			if(qq) console.log(qq.e1.gain.value)
			let d = t - last 
			last = t
		}
		setInterval(frame,this.intval)
//		requestAnimationFrame(frame)	
	}
	setqueue(id,ongn,note) {
		if(note.time < this.now()+this.dtime) {	//即時スケジュール
			ongn.note(note.note,note.len,note.time)
			return 
		}
		this.queue.push(
			{id:id,ongn:ongn,note:note.note,len:note.len,time:note.time}
		)
	}
	setloop(id,time,callback) {
		this.queue.push({id:id,time:time,loop:callback})
	}
	clearqueue(id) {
		this.queue = this.queue.filter((q)=>q.id !== id)
	}
	now() {
		return this.ctx.currentTime
	}
	createOngen(opt,tr=null) {
		let  o = new Ongen(this) ;
		o.init(opt,tr) ;
		
		return o ;
	}
	createTrack(opt) {
		let  t = new Track(this) ;
		t.init(opt) ;
		return t ;
	}
	copyobj(s,d) {
		for(let  k in s) {
			if(s[k]!==null && typeof s[k]=="object") {
				if(d[k]===undefined) d[k] = {} ;
				this.copyobj(s[k],d[k]) ;
			}
			else d[k]=s[k] ;
		}
	}
	showwave(can,intv) {
		can = can.getContext('2d') ;
		can.strokeStyle="#fff" ;
		can.fillStyle="#486";
		let  w = can.canvas.width ;
		let  hw = w/2 ;
		let  h = can.canvas.height ;
		let  ad = new Uint8Array(512) ;
		let  self = this ;
		setInterval(function() {
			self.analyser.getByteTimeDomainData(ad) ;	//波形取得
			can.fillRect(0,0,w,h);
			can.beginPath();
			can.moveTo(0,h/2);
			for(let i=0;i<512;i++) {
				can.lineTo(i*hw/512,h-ad[i]*h/256);
			}
			self.analyser.getByteFrequencyData(ad);	//周波数スペクトル取得
			can.moveTo(hw,h);
			let  am =0,an= 512 ;
			for(let i=0;i<512;i++) {
				if(am<ad[i]) am = ad[i];
				if(an>ad[i]) an = ad[i] ;
				can.moveTo(i*hw/512+hw,h);
				can.lineTo(i*hw/512+hw,h-ad[i]*h/256);
			}
			can.stroke() ;
		},intv);	
	}
	mml2note(mml,opt=null) {
		let oct = 4 
		let len = 4
		let gate = 0.8
		
		function getlen(s) {
			const m = s.match(/([0-9]*)(\.*)/)
			if(m==null) return 1/len
			let l = m[1]>0?1/m[1]:1/len
			if(m[2]!="") l = l * 1.5 
			return l 
		}
		function parsmml(mml) {
			const notes = []
			const exp = RegExp("O[1-8]|<|>|L[0-9]+|H[0-9\\.]+|"+
				"[CDEFGAB][!#-+]*[0-9]*\\.*&?|R[0-9]*\\.*|"+
				"{([A-G][!#-+]*|<|>)+}[0-9]*",
			'gi')
//				console.log(/O[1-8]|<|>|L[0-9]+|H[0-9\.]+|[CDEFGAB][!#-+]*[0-9]*\.*&?|R[0-9]*\.*|{([A-G][!#\-+]*|<|>)+}[0-9]*/gi)
			const m = mml.match(exp)
			console.log(m)
			for(let n of m) {
				const c = n[0].toUpperCase()
				switch(c) {
					case "O":
						oct = parseInt(n.substr(1))
						break ; 
					case "<":
						oct += 1 ;
						break ;
					case ">":
						oct -= 1 ;
						break 
					case "L":
						len = parseInt(n.substr(1))
						break ;  				
					case "H":
						gate = parseFloat(n.substr(1))
						break ;  
					case "{":
						const mm = n.match(/{(.*)}([0-9]*)/)
						const rr = parsmml(mm[1]) 
						const rate = (getlen(mm[2])/rr.length)*len
						for(let nm of rr) {
							notes.push({
								note:nm.note,
								len:nm.len*rate,
								gate:nm.gate*rate
							})
						}
						break 
					case "R":
					default:
						const s = n.substr(1).match(/([!#-+]*)([0-9]*\.*)(&?)/)
						let l = getlen(s[2])
						notes.push({
							note:c+s[1]+oct,
							len:l,
							gate:gate*l
						})
				}
			}
			return notes 
		}
		if(Array.isArray(mml)) mml = mml.join("")
		return parsmml(mml)
	}
} // Synth

class Track {
	constructor(synth) {
		this.synth = synth ;
		this.ctx = synth.ctx ;
	}	
	init(param) {
		this.amp = this.ctx.createGain() ;
		this.amp.connect(this.synth.innode) ;
		this.innode = this.amp

		if(param.stereo_pan!==undefined) {
			this.span = this.ctx.createStereoPanner()
			this.amp.disconnect()
			this.amp.connect(this.span)
			this.span.connect(this.synth.innode) 
			this.innode = this.span
			this.span.pan.setValueAtTime(param.stereo_pan,0)
		}
		if(param.space_pan!==undefined) {
			this.vpan = this.ctx.createPanner()
			this.amp.disconnect()
			this.amp.connect(this.vpan)
			this.vpan.connect(this.synth.innode) 	
			this.innode = this.vpan	
		}		
	}
}//Track

class Ongen {
	constructor(synth) {
		this.synth = synth ;
		this.ctx = synth.ctx ;
	}
init(param,track=null) {
	this.outnode = this.synth.innode 	
	if(track) this.outnode = track.innode

	this.e1 = this.ctx.createGain() ;
	this.f1 = this.ctx.createBiquadFilter() ;
	this.o1 = this.ctx.createOscillator() ;
	if(param.waveform=="noise") {
		let  bufsize = 1024 ;
		this.n1 = this.ctx.createScriptProcessor(bufsize) ;
		this.n1.onaudioprocess = function(ev) {
			let  buf0 = ev.outputBuffer.getChannelData(0);
			let  buf1 = ev.outputBuffer.getChannelData(1);
			for(let  i = 0; i < bufsize; ++i) {
				buf0[i] = buf1[i] = (Math.random() - 0.5) ;
			}
//			console.log("p") ;
		}
		this.o1.connect(this.n1) ;
		this.n1.connect(this.f1) ;
	} else {
		this.o1.connect(this.f1) ;
	}
	this.f1.connect(this.e1) ;
	this.e1.connect(this.outnode) ;
	this.f1.frequency.value = 20000 ;
	this.e1.gain.value = 0 ;
	this.tune = 440 ;
	this.sf = false ;
	
	if(param.lfo_osc) {
		this.l1 = this.ctx.createOscillator() ;
		this.l1g = this.ctx.createGain() ;
		this.l1.connect(this.l1g) ;
		this.l1g.connect(this.o1.frequency) ;
	}
	if(param.lfo_flt) {
		this.l2 = this.ctx.createOscillator() ;
		this.l2g = this.ctx.createGain() ;
		this.l2.connect(this.l2g) ;
		this.l2g.connect(this.f1.frequency) ;
	}
	if(param.lfo_amp) {
		this.l3 = this.ctx.createOscillator() ;
		this.l3g = this.ctx.createGain() ;
		this.lag = this.ctx.createGain() ;
		this.l3.connect(this.l3g) ;
		this.l3g.connect(this.lag.gain) ;
		this.f1.connect(this.lag);
		this.lag.connect(this.e1) ;
	}
	if(param.stereo_pan!==undefined) {
		this.span = this.ctx.createStereoPanner()
		this.e1.disconnect()
		this.e1.connect(this.span)
		this.span.connect(this.outnode) 
		this.span.pan.setValueAtTime(param.stereo_pan,0)
	}
	if(param.space_pan!==undefined) {
		this.vpan = this.ctx.createPanner()
		this.e1.disconnect()
		this.e1.connect(this.vpan)
		this.vpan.connect(this.outnode) 		
	}
	this.opt = {
		'eg':{
			'attack':0.1,
			'decay':0.1,
			'sustain':0.5,
			'release':1.0,
			'maxvalue':0.8,
			'minvalue':0
		},
		'timemode':0	//0:relative now 1:absolute
	};
	this.setopt(param) ;
}

setopt(param) {
	if(param) {
		this.synth.copyobj(param,this.opt) ;
	}
//	console.log(this.opt) ;
	if(this.opt.waveform && this.opt.waveform!="noise") this.o1.type = this.opt.waveform ;
	if(this.opt.cutoff) this.f1.frequency.value = this.opt.cutoff ;
	if(this.opt.resonance) this.f1.Q.value = this.opt.resonance ;
	if(this.opt.ftype) this.f1.type = this.opt.ftype ;
	if(param.lfo_osc) {
		this.l1.frequency.value = param.lfo_osc.frequency ;
		this.l1.type = param.lfo_osc.waveform==undefined?"sine":param.lfo_osc.waveform ;
		this.l1g.gain.value = param.lfo_osc.level ;
	}
	if(param.lfo_flt) {
		this.l2.frequency.value = param.lfo_flt.frequency ;
		this.l2.type = param.lfo_flt.waveform ;
		this.l2g.gain.value = param.lfo_flt.level ;
	}
	if(param.lfo_amp) {
		this.l3.frequency.value = param.lfo_amp.frequency ;
		this.l3.type = param.lfo_amp.waveform ;
		this.l3g.gain.value = param.lfo_amp.level ;
	}

	let  self = this ;
	this.o1.onended =function(){
		console.log("oscend")
		if(self.opt.waveform=="noise") self.n1.disconnect() ;
		if(self.opt.onended)  self.opt.onended.call(self) ;
	}
}

start(t) {
	if(!this.sf) {
		this.o1.start(t) ;
		if(this.l1) this.l1.start(t) ;
		if(this.l2) this.l2.start(t) ;
		if(this.l3) this.l3.start(t) ;
		this.sf = true ;
	}
}

note(f,len,time) {
	if(time==undefined) time = 0 ;
	if(typeof f =="string") f = this.note2freq(f) ;
	let  now=this.ctx.currentTime ;
console.log(f+" "+len+" "+time)

	let tofs = (this.opt.timemode==1?0:now) + time
	this.o1.frequency.setValueAtTime(f, tofs) ;
	this.e1.gain.cancelAndHoldAtTime(tofs==0?0:(tofs-0.01)) //前の音のenvelope解除
	this.e1.gain.linearRampToValueAtTime(0, tofs );
	this.endtime = this.setenv(this.e1.gain,tofs,len,this.opt.eg) ;
	
	if(this.opt.eg_osc) {
		this.opt.eg.minvalue = f;
		this.opt.eg.maxvalue = this.opt.eg_osc.minvalue+100 ;
		this.setenv(this.o1.frequency,tofs,len,this.opt.eg_osc) ;
		this.o1.frequency.cancelAndHoldAtTime(tofs==0?0:(tofs-0.01)) //前の音のenvelope解除
	}
	this.start(tofs) ;
	if(!this.opt.continuous) {
//		this.o1.stop(this.endtime) ;	
	}
}
noteoff(time) {
	const endtime = time +this.opt.eg.release  ;
	const sv = (this.opt.eg.maxvalue-this.opt.eg.minvalue)*this.opt.eg.sustain+this.opt.eg.minvalue ;
	this.e1.gain.setValueAtTime(sv, this.synth.now());
	this.e1.gain.linearRampToValueAtTime(this.opt.eg.minvalue, endtime );	
}
setenv(tgt,now,len,param) {
//	console.log(param)
	tgt.setValueAtTime(param.minvalue, now);
	tgt.linearRampToValueAtTime(param.maxvalue, now + param.attack);
	let  sv = (param.maxvalue-param.minvalue)*param.sustain+param.minvalue ;
	tgt.linearRampToValueAtTime(sv, now + param.attack+param.decay);
	let endtime
	if(len>0) {
		tgt.setValueAtTime(sv, now + len);
		endtime = now + len+param.release  ;
		tgt.linearRampToValueAtTime(param.minvalue, endtime );
	} else endtime = 0
//	console.log("eg end"+endtime)
	return endtime ;
}
note2freq(note) {
	let  na = {'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11} ;
	if(note.match(/([CDEFGAB])([#\+\-]*)([0-9]+)/i)) {
		let  n = na[RegExp.$1.toLowerCase()] ;
		let  m = RegExp.$2 ;
		let  o = RegExp.$3 ;
		if(m=="#"||m=="+") n += 1 ;
		if(m=="-") n -= 1 ;
		n = o*12+n ;
		let  f = Math.pow(2,(n-57)/12)*this.tune ;
//		console.log(f) ;
		return f ;
	} 
	return null  ;
}
}//Ongen


//Clip = ongen + sequence 
class Clip {
	constructor(synth,cb=null) {
		this.syn = synth
		this.id = crypto.randomUUID()
		this.cb = cb 
	}
	setongn(opt) {
		opt.timemode = 1 
		this.opt = opt
		if(!this.opt.poly) {		// mono mode single instance
			if(!this.ongn) this.ongn = this.syn.createOngen(opt)
			else this.ongn.setopt(opt)
		}
	}
	setseq(seq) {
		if(seq.mml) {
			seq.notes = this.syn.mml2note(seq.mml)
//			console.log(seq) 
		}
		this.seq = seq 
	}
	setnote(st) {
		let ts = this.seq.timescale
		if(this.seq.bpm) ts = 240/this.seq.bpm
		let t = st 
		for(let a of this.seq.notes) {
			if(typeof a.note != "string" ||  a.note.substr(0,1).toUpperCase()!="R") { 
				if(this.opt.poly) this.ongn = this.syn.createOngen(this.opt)
				this.syn.setqueue(this.id,this.ongn,{note:a.note,len:a.gate*ts,time:t})
			}
			t += a.len * ts  
		}
		this.et = t 		
	}
	setqueue(st) {
		this.st = (st===null)?this.syn.now():st 
		this.setnote(this.st)
		if(this.seq.cont) return 
		--this.loopc 
		if(this.play )  {
			this.syn.setloop(this.id,this.et-0.1,t=>{
				if(this.loopc==0) {
					console.log("end")
					if(this.cb) this.cb() 
				}else this.setqueue(this.et)
			})
		}
	}
	start(st=null) {
		this.play = 1 
		this.loopc = this.seq.loop 
		this.setqueue(st) 
	}	
	stop() {
		console.log("stop") 
		if(this.seq.cont) this.ongn.noteoff(this.syn.now())
		this.syn.clearqueue(this.id)

		this.play = 0 
		this.loopc = 0 
	}
	getnote() {
		if(!this.ongn) return null ;
		return {
			f:this.ongn.o1.frequency.value,
			v:this.ongn.e1.gain.value 
		}
	}
} //Clip

const WAS = {synth:Synth,ongen:Ongen,track:Track,clip:Clip}
