//WabAudio wrapper
//  by wakufactory 

class Synth {
	constructor(opt) {
		if(!window.AudioContext ) {
			this.error = true; 
			return ;
		}
		this.ctx = new window.AudioContext() ;
		this.queue = new SeqQueue(this.ctx)

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
		d = structuredClone(s)
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

} // Synth

class SeqQueue {
	constructor(ctx) {
		this.ctx = ctx
		this.queue = [] 
		this.pqueue = []
		
		this.intval = 20 
		this.dtime = 80/1000 ;
		let last = 0
		let qq = null	

		const frame = (time)=> {
//			console.log(this.queue.length)
			let now = this.ctx.currentTime
			const nq = []
			for(let q of this.queue) {
				if(q.time < now+this.dtime) {
					if(q.note)	 {
						const et = q.ongn.note(q.note,q.len,q.time) ;
						this.pqueue.push({ongn:q.ongn,time:q.time,len:q.len,endtime:et,id:q.id,name:q.name}) 
					}
					if(q.loop) {	//loop callback
						q.loop(now)
					}
				} else nq.push(q) ;
			}

			this.queue = nq ;
			let pq = [] 
			for(let q of this.pqueue) {
				if(q.endtime < now) {
					if(q.ongn.poly) q.ongn.disconnect()
				} else pq.push(q)
			}
			this.pqueue = pq 
			if(this.pqueue.length>0) {
				console.log(now)
				console.log(this.pqueue)
			}
			let d = now - last 
			last = now
		}
		setInterval(frame,this.intval)
	}
	setqueue(id,ongn,note) {
		if(note.time < this.ctx.currentTime +this.dtime) {	//即時スケジュール
			const et = ongn.note(note.note,note.len,note.time)
			this.pqueue.push({ongn:ongn,time:note.time,len:note.len,endtime:et,id:id,name:note.name}) 
			return 
		}
		this.queue.push(
			{id:id,ongn:ongn,note:note.note,len:note.len,time:note.time,name:note.name}
		)
	}
	setloop(id,time,callback) {
		this.queue.push({id:id,time:time,loop:callback})
	}
	clearqueue(id) {
		this.queue = this.queue.filter((q)=>q.id !== id)
	}	
	
}//Sqeuence

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
// osc1 - osc1_a ---- filter1 --- amp1 --- out
// osc2 - osc2_a  -|        env1---|
// noise - noise_a-|
// lfo_amp -- lfo_amp_a -----------|

class Ongen {
constructor(synth) {
	this.synth = synth ;
	this.ctx = synth.ctx ;
	this.poly = false 
	this.nodes = [
		{type:"osc",name:"osc1"},
		{type:"filt",name:"filt1"},
		{type:"env",name:"env1"},
		{type:"gain",name:"gain1"},
		{type:"osc",name:"lfo_osc1"},
		{type:"gain",name:"lfo_osc1_gain"}
	]
	this.patch = [
		{out:"osc",'in':"filt1"},
		{out:"filt1",'in':"gain1"},
		{out:"gain1",'in':"master"},
		{out:"env1",'in':"gain1",target:"gain"},
		{out:"lf_osc1",'in':"lfo_osc1_gain"},
		{out:"lf_osc1_gain",'in':"osc1",target:"detune"}
	]
}
init(param,track=null) {
	this.outnode = this.synth.innode 	
	if(track) this.outnode = track.innode

	this.e1 = this.ctx.createGain() ;
	this.f1 = this.ctx.createBiquadFilter() ;
	this.o1 = this.ctx.createOscillator() ;
	if(param.osc1?.waveform=="noise") {
		var bufsize = Math.floor(0.5*this.ctx.sampleRate) ;
		var buf = this.ctx.createBuffer(1,bufsize,this.ctx.sampleRate);
		var buf0 = buf.getChannelData(0);
		for(var i = 0; i < bufsize; ++i) {
			buf0[i] = (Math.random()*2 -1.0) ;
		}
		this.no1 = this.ctx.createBufferSource() ;
		this.no1.buffer = buf ;
		this.no1.loop = true ;
		this.no1.connect(this.f1) ;
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
		this.l1g.connect(this.o1.detune) ;
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
		this.f1.disconnect()
		this.f1.connect(this.lag);
		this.lag.connect(this.e1) ;
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
disconnect() {
	this.e1.disconnect()
}

setopt(param) {
	if(param) {
		this.opt = structuredClone(param) ;
	}
//	console.log(this.opt) ;
	if(this.opt.osc1?.waveform && this.opt.osc1.waveform!="noise") this.o1.type = this.opt.osc1.waveform ;
	if(this.opt.osc1?.detune) this.o1.detune = this.opt.osc1.detune 
	if(this.opt.osc1?.overtone) {
		const opts = {} 
		let real = this.opt.osc1.overtone.cos
		if(real) opts.real = Float32Array.from(real) 
		let imag = this.opt.osc1.overtone.sin
		if(imag) opts.imag = Float32Array.from(imag)
		this.o1.setPeriodicWave(
			new PeriodicWave(this.ctx,opts)
		)
	}

	if(this.opt.filt1?.cutoff) this.f1.frequency.value = this.opt.filt1.cutoff ;
	if(this.opt.filt1?.resonance) this.f1.Q.value = this.opt.filt1.resonance ;
	if(this.opt.filt1?.gain) this.f1.gain.value = this.opt.filt1.gain ;
	if(this.opt.filt1?.ftype) this.f1.type = this.opt.filt1.ftype ;
	if(this.no1) {
		if(param.osc1.noiseRate) this.no1.playbackRate.value = param.osc1.noiseRate
	}
	if(param.lfo_osc) {
		this.l1.frequency.value = param.lfo_osc.frequency ;
		this.l1.type = param.lfo_osc.waveform==undefined?"sine":param.lfo_osc.waveform ;
		this.l1g.gain.value = param.lfo_osc.level ;
	}
	if(param.lfo_flt) {
		this.l2.frequency.value = param.lfo_flt.frequency ;
		this.l2.type = param.lfo_flt.waveform==undefined?"sine":param.lfo_flt.waveform ;
		this.l2g.gain.value = param.lfo_flt.level ;
	}
	if(param.lfo_amp) {
		this.l3.frequency.value = param.lfo_amp.frequency ;
		this.l3.type = param.lfo_amp.waveform==undefined?"sine":param.lfo_amp.waveform ;
		this.l3g.gain.value = param.lfo_amp.level ;
		this.lag.gain.value = param.lfo_amp.ofs==undefined?0: param.lfo_amp.ofs
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
		this.sf = true ;
		if(this.no1) this.no1.start(t)
		if(this.l1) this.l1.start(t)
		if(this.l2) this.l2.start(t)
		if(this.l3) this.l3.start(t)
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
	return this.endtime
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
		this.queue = synth.queue
		this.id = crypto.randomUUID()
		this.cb = cb 
	}
	setongn(opt) {
		opt.timemode = 1 
		this.opt = opt
		if(!this.opt.poly) {		// mono mode single ongen instance
			if(!this.ongn) this.ongn = this.syn.createOngen(opt)
			else this.ongn.setopt(opt)
			this.ongn.poly = false 
		}
	}
	setseq(seq) {
		if(seq.mml) {
			seq.notes = MML.mml2note(seq.mml)
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
				if(this.opt.poly) {
					this.ongn = this.syn.createOngen(this.opt)
					this.ongn.poly = true 
				}
				this.queue.setqueue(this.id,this.ongn,{note:a.note,len:a.gate*ts,time:t,id:this.id,name:a.name})
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
			this.queue.setloop(this.id,this.et-0.01,t=>{
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
		this.queue.clearqueue(this.id)

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
	disconnect() {
		if(this.ongn) this.ongn.disconnect()
	}
} //Clip

class MML {
	static mml2note(mml,opt=null) {
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
								name:nm.name,
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
							name:c+oct,
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
}
const WAS = {synth:Synth,ongen:Ongen,track:Track,queue:SeqQueue,clip:Clip,mml:MML}
