// NOMAD-16 pour iPhone — VERSION 5 (Xcode 16, appairage Bluetooth MIDI, hors ligne) : une app qui ouvre NOMAD et lui donne le MIDI de l'iPhone (Akai MPK mini), sans MIDIWeb.
// À coller à la place du contenu de NOMAD16App.swift dans un projet Xcode « App » (SwiftUI, Swift).
// Supprimer ContentView.swift. Ajouter dans l'onglet Info de la cible : « Privacy - Microphone Usage Description »
// et « Privacy - Bluetooth Always Usage Description » (contrôleurs MIDI sans fil).
// Hors ligne : le fichier NOMAD16-Info.plist (WKAppBoundDomains = lcqbeats.github.io) active le service worker dans l'app.

import SwiftUI
import WebKit
import CoreMIDI
import CoreAudioKit
import AVFoundation

// Adresse de NOMAD (toujours la dernière version en ligne)
let nomadURL = URL(string: "https://lcqbeats.github.io/nomad16/")!

@main
struct NOMAD16App: App {
    init() {
        // son même en mode silencieux, sans couper la musique des autres apps, petits tampons pour la latence
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? s.setPreferredIOBufferDuration(0.005)
        try? s.setActive(true)
    }
    var body: some Scene {
        WindowGroup {
            NomadWebView()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color.black)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true } // l'écran ne s'éteint pas pendant qu'on joue
        }
    }
}

// MARK: - Vue web

struct NomadWebView: UIViewRepresentable {
    func makeCoordinator() -> NomadCoordinator { NomadCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.limitsNavigationsToAppBoundDomains = true // nécessaire pour le mode hors ligne (service worker)
        let uc = WKUserContentController()
        uc.addUserScript(WKUserScript(source: webMIDIPolyfill, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        uc.add(context.coordinator, name: "nomadMidi")
        cfg.userContentController = uc

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.isOpaque = false
        wv.backgroundColor = .black
        wv.scrollView.backgroundColor = .black
        wv.scrollView.bounces = false
        wv.allowsBackForwardNavigationGestures = false
        wv.uiDelegate = context.coordinator
        wv.navigationDelegate = context.coordinator
        if #available(iOS 16.4, *) { wv.isInspectable = true } // Safari > Développement, pour déboguer depuis le Mac
        context.coordinator.webView = wv
        context.coordinator.startMIDI()
        wv.load(URLRequest(url: nomadURL, cachePolicy: .reloadRevalidatingCacheData))
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@MainActor
final class NomadCoordinator: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    weak var webView: WKWebView?
    let midi = MIDIEngine()
    private var downloads: [ObjectIdentifier: URL] = [:]

    func startMIDI() {
        midi.onMessage = { @Sendable id, bytes in
            Task { @MainActor [weak self] in self?.deliver(id: id, bytes: bytes) }
        }
        midi.onDevices = { @Sendable json in
            Task { @MainActor [weak self] in self?.runJS("window.__nomadMidiDevices && window.__nomadMidiDevices(\(json))") }
        }
        midi.start()
    }

    private func deliver(id: String, bytes: [UInt8]) {
        let list = bytes.map(String.init).joined(separator: ",")
        runJS("window.__nomadMidiIn && window.__nomadMidiIn('\(id)',[\(list)])")
    }

    private func runJS(_ js: String) {
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // messages de la page : demande d'accès MIDI, envoi vers l'Akai
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "init" { midi.rescan() }
        if type == "btpair" { presentBluetoothPairing() }
        if type == "send", let id = body["id"] as? String, let data = body["data"] as? [Int] {
            midi.send(to: id, bytes: data.map { UInt8(truncatingIfNeeded: $0) })
        }
    }

    // contrôleurs MIDI Bluetooth (DDJ-200, Mix Ultra, WIDI…) : fenêtre d'appairage d'Apple
    private func presentBluetoothPairing() {
        guard let root = webView?.window?.rootViewController else { return }
        let vc = CABTMIDICentralViewController()
        vc.title = "MIDI Bluetooth"
        let nav = UINavigationController(rootViewController: vc)
        vc.navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self, weak nav] _ in
            nav?.dismiss(animated: true)
            self?.midi.rescan()
        })
        root.present(nav, animated: true)
    }

    // micro / iRig : autorisé sans redemander à chaque fois
    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin, initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        .grant
    }

    // téléchargements (exports WAV, ZIP MPC, projets .nomad) : proposés dans la feuille de partage (Enregistrer dans Fichiers)
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        if navigationAction.shouldPerformDownload { return .download }
        if let url = navigationAction.request.url, url.scheme == "blob" || url.scheme == "data" { return .download }
        if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
            await UIApplication.shared.open(url) // liens externes (fiches de la Bibliothèque du Congrès)
            return .cancel
        }
        return .allow
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        navigationResponse.canShowMIMEType ? .allow : .download
    }
    // fenêtres ouvertes par la page (target=_blank) : dans Safari
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(suggestedFilename.isEmpty ? "nomad16" : suggestedFilename)
        downloads[ObjectIdentifier(download)] = url
        return url
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)), let wv = webView else { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = wv
        share.popoverPresentationController?.sourceRect = CGRect(x: wv.bounds.midX, y: wv.bounds.midY, width: 1, height: 1)
        wv.window?.rootViewController?.present(share, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }

    // page hors ligne au lancement : message simple et nouvel essai
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        webView.loadHTMLString("<body style='background:#0c0b0a;color:#ece3d3;font:16px -apple-system;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center'><div><b style='color:#e2282c;font-size:28px'>NOMAD 16</b><p>Pas de connexion à Internet.<br>Nouvel essai dans 5 secondes…</p></div></body>", baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { webView.load(URLRequest(url: nomadURL)) }
    }
}

// MARK: - MIDI (CoreMIDI) : entrées vers la page, sorties depuis la page

// Les rappels MIDI arrivent sur un fil de CoreMIDI : rien ici n'est lié au fil principal (compatible Xcode 16 et Xcode 26).
final class MIDIEngine: @unchecked Sendable {
    nonisolated(unsafe) var onMessage: (@Sendable (String, [UInt8]) -> Void)?
    nonisolated(unsafe) var onDevices: (@Sendable (String) -> Void)?
    nonisolated(unsafe) private var client = MIDIClientRef()
    nonisolated(unsafe) private var inPort = MIDIPortRef()
    nonisolated(unsafe) private var outPort = MIDIPortRef()
    nonisolated(unsafe) private var connected = Set<MIDIUniqueID>()
    nonisolated private let lock = NSLock()

    nonisolated init() {}

    nonisolated func start() {
        MIDIClientCreateWithBlock("NOMAD16" as CFString, &client) { [weak self] note in
            if note.pointee.messageID == .msgSetupChanged { self?.rescan() }
        }
        MIDIInputPortCreateWithBlock(client, "NOMAD16 In" as CFString, &inPort) { [weak self] list, refCon in
            guard let self else { return }
            let id = String(Int(bitPattern: refCon))
            for p in list.unsafeSequence() {
                let len = Int(p.pointee.length)
                let bytes: [UInt8] = withUnsafeBytes(of: p.pointee.data) { Array($0.prefix(min(len, 256))) }
                for m in MIDIEngine.split(bytes) { self.onMessage?(id, m) }
            }
        }
        MIDIOutputPortCreate(client, "NOMAD16 Out" as CFString, &outPort)
        rescan()
    }

    nonisolated private func uid(_ obj: MIDIObjectRef) -> MIDIUniqueID {
        var v: MIDIUniqueID = 0
        MIDIObjectGetIntegerProperty(obj, kMIDIPropertyUniqueID, &v)
        return v
    }
    nonisolated private func name(_ obj: MIDIObjectRef) -> String {
        var s: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(obj, kMIDIPropertyDisplayName, &s)
        return (s?.takeRetainedValue() as String?) ?? "MIDI"
    }

    nonisolated func rescan() {
        lock.lock(); defer { lock.unlock() }
        var ins: [[String: String]] = [], outs: [[String: String]] = []
        var now = Set<MIDIUniqueID>()
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i), u = uid(src)
            now.insert(u)
            if !connected.contains(u) {
                MIDIPortConnectSource(inPort, src, UnsafeMutableRawPointer(bitPattern: Int(u) == 0 ? 1 : Int(u)))
            }
            ins.append(["id": String(Int(u) == 0 ? 1 : Int(u)), "name": name(src)])
        }
        connected = now
        for i in 0..<MIDIGetNumberOfDestinations() {
            let dst = MIDIGetDestination(i)
            outs.append(["id": String(Int(uid(dst))), "name": name(dst)])
        }
        let payload: [String: Any] = ["inputs": ins, "outputs": outs]
        if let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) {
            onDevices?(json)
        }
    }

    nonisolated func send(to id: String, bytes: [UInt8]) {
        guard !bytes.isEmpty else { return }
        for i in 0..<MIDIGetNumberOfDestinations() {
            let dst = MIDIGetDestination(i)
            guard String(Int(uid(dst))) == id else { continue }
            var buffer = [UInt8](repeating: 0, count: 1024 + bytes.count)
            buffer.withUnsafeMutableBytes { raw in
                let pl = raw.baseAddress!.assumingMemoryBound(to: MIDIPacketList.self)
                var pkt = MIDIPacketListInit(pl)
                pkt = MIDIPacketListAdd(pl, raw.count, pkt, 0, bytes.count, bytes)
                MIDISend(outPort, dst, pl)
            }
        }
    }

    // découpe un paquet en messages MIDI (statut courant compris)
    nonisolated static func split(_ b: [UInt8]) -> [[UInt8]] {
        var out: [[UInt8]] = []
        var i = 0
        var running: UInt8 = 0
        while i < b.count {
            var st = b[i]
            if st == 0xF0 {
                if let e = b[i...].firstIndex(of: 0xF7) { out.append(Array(b[i...e])); i = e + 1 } else { out.append(Array(b[i...])); i = b.count }
                continue
            }
            if st < 0x80 {
                if running == 0 { i += 1; continue }
                st = running
            } else {
                i += 1
                if st < 0xF0 { running = st }
            }
            let len: Int
            switch st & 0xF0 {
            case 0xC0, 0xD0: len = 1
            case 0xF0: len = st == 0xF2 ? 2 : (st == 0xF1 || st == 0xF3 ? 1 : 0)
            default: len = 2
            }
            let end = min(b.count, i + len)
            out.append([st] + Array(b[i..<end]))
            i = end
        }
        return out
    }
}

// MARK: - Web MIDI pour la page (navigator.requestMIDIAccess)

let webMIDIPolyfill = """
(function () {
  if (window.__nomadNative) return;
  window.__nomadNative = true;
  var inputs = new Map(), outputs = new Map(), access = null;
  function mkIn(d) {
    return { id: d.id, name: d.name, manufacturer: "", type: "input", state: "connected", connection: "open", onmidimessage: null, _l: [],
      addEventListener: function (t, f) { if (t === "midimessage") this._l.push(f); },
      removeEventListener: function (t, f) { this._l = this._l.filter(function (x) { return x !== f; }); },
      open: function () { return Promise.resolve(this); }, close: function () { return Promise.resolve(this); } };
  }
  function mkOut(d) {
    return { id: d.id, name: d.name, manufacturer: "", type: "output", state: "connected", connection: "open",
      send: function (data) { window.webkit.messageHandlers.nomadMidi.postMessage({ type: "send", id: d.id, data: Array.from(data) }); },
      clear: function () {}, open: function () { return Promise.resolve(this); }, close: function () { return Promise.resolve(this); } };
  }
  window.__nomadMidiDevices = function (list) {
    var si = new Set(), so = new Set();
    list.inputs.forEach(function (d) { si.add(d.id); if (!inputs.has(d.id)) inputs.set(d.id, mkIn(d)); });
    Array.from(inputs.keys()).forEach(function (k) { if (!si.has(k)) inputs.delete(k); });
    list.outputs.forEach(function (d) { so.add(d.id); if (!outputs.has(d.id)) outputs.set(d.id, mkOut(d)); });
    Array.from(outputs.keys()).forEach(function (k) { if (!so.has(k)) outputs.delete(k); });
    if (access && typeof access.onstatechange === "function") access.onstatechange({});
  };
  window.__nomadMidiIn = function (id, bytes) {
    var i = inputs.get(id); if (!i) return;
    var ev = { data: new Uint8Array(bytes), timeStamp: performance.now(), target: i };
    if (typeof i.onmidimessage === "function") i.onmidimessage(ev);
    i._l.forEach(function (f) { f(ev); });
  };
  navigator.requestMIDIAccess = function () {
    return new Promise(function (resolve) {
      access = { inputs: inputs, outputs: outputs, sysexEnabled: true, onstatechange: null, addEventListener: function () {}, removeEventListener: function () {} };
      window.webkit.messageHandlers.nomadMidi.postMessage({ type: "init" });
      setTimeout(function () { resolve(access); }, 80);
    });
  };
})();
"""
