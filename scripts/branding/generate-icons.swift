// Run from the project root after: node scripts/branding/prepare-logo.cjs
// Renders the same approved vector outlines into all app and press exports.
import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Geometry: Decodable {
    let width: Double, height: Double, tileSize: Double
    let tile: [[[Double]]], glyph: [[[Double]]], letters: [[[Double]]]
}
let geometry = try JSONDecoder().decode(Geometry.self, from: Data(contentsOf: URL(fileURLWithPath: "assets/brand/geometry.json")))
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ hex: String) -> CGColor {
    let rgb = UInt32(hex.dropFirst(), radix: 16)!
    return CGColor(colorSpace: colorSpace, components: [CGFloat((rgb >> 16) & 255) / 255, CGFloat((rgb >> 8) & 255) / 255, CGFloat(rgb & 255) / 255, 1])!
}
let tile = color("#909DC3"), wordmark = color("#7D89B1"), ink = color("#242A3D"), paper = color("#FCFBF8"), mist = color("#ECEEF6"), white = color("#FFFFFF")
func path(_ contours: [[[Double]]]) -> CGPath {
    let path = CGMutablePath()
    for points in contours {
        guard let first = points.first, let last = points.last else { continue }
        path.move(to: CGPoint(x: (last[0] + first[0]) / 2, y: (last[1] + first[1]) / 2))
        for (i, p) in points.enumerated() {
            let next = points[(i + 1) % points.count]
            path.addQuadCurve(to: CGPoint(x: (p[0] + next[0]) / 2, y: (p[1] + next[1]) / 2), control: CGPoint(x: p[0], y: p[1]))
        }
        path.closeSubpath()
    }
    return path
}
let tilePath = path(geometry.tile), glyphPath = path(geometry.glyph), textPath = path(geometry.letters)
func fill(_ ctx: CGContext, _ path: CGPath, _ color: CGColor) { ctx.setFillColor(color); ctx.addPath(path); ctx.fillPath() }
func logo(_ ctx: CGContext, x: CGFloat, y: CGFloat, width: CGFloat, variant: String = "color", mark: Bool = false, glyph: Bool = false) {
    ctx.saveGState()
    ctx.translateBy(x: x, y: y)
    let scale = width / (mark || glyph ? geometry.tileSize : geometry.width)
    ctx.scaleBy(x: scale, y: scale)
    if glyph { fill(ctx, glyphPath, white) }
    else if variant == "color" {
        fill(ctx, tilePath, tile); fill(ctx, glyphPath, white)
        if !mark { fill(ctx, textPath, wordmark) }
    } else {
        ctx.setFillColor(variant == "white" ? white : ink)
        ctx.addPath(tilePath); ctx.addPath(glyphPath)
        if !mark { ctx.addPath(textPath) }
        ctx.drawPath(using: .eoFill)
    }
    ctx.restoreGState()
}
func render(_ file: String, width: Int, height: Int, background: CGColor? = nil, draw: (CGContext) -> Void) throws {
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    if let background { ctx.setFillColor(background); ctx.fill(CGRect(x: 0, y: 0, width: width, height: height)) }
    ctx.translateBy(x: 0, y: CGFloat(height)); ctx.scaleBy(x: 1, y: -1)
    draw(ctx)
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: file) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "travi.branding", code: 1) }
}
for variant in ["color", "white", "dark"] {
    for mark in [false, true] {
        let name = "\(mark ? "mark" : "logo")-\(variant)"
        let width = mark ? 1024 : 2400
        let height = mark ? width : Int(Double(width) * geometry.height / geometry.width)
        try render("public/press-kit/logos/travi-\(name).png", width: width, height: height) { ctx in logo(ctx, x: 0, y: 0, width: CGFloat(width), variant: variant, mark: mark) }
        // Small, bundled assets keep mobile decoding and download costs low.
        let appWidth = mark ? 256 : 768
        let appHeight = mark ? appWidth : Int(Double(appWidth) * geometry.height / geometry.width)
        try render("assets/brand/\(name).png", width: appWidth, height: appHeight) { ctx in logo(ctx, x: 0, y: 0, width: CGFloat(appWidth), variant: variant, mark: mark) }
    }
}
try render("assets/images/icon.png", width: 1024, height: 1024, background: tile) { ctx in logo(ctx, x: 72, y: 72, width: 880, glyph: true) }
try render("assets/images/favicon.png", width: 64, height: 64) { ctx in logo(ctx, x: 0, y: 0, width: 64, mark: true) }
try render("assets/images/splash-icon.png", width: 1024, height: 1024) { ctx in logo(ctx, x: 72, y: 72, width: 880, glyph: true) }
for filename in ["android-icon-foreground", "android-icon-monochrome"] {
    try render("assets/images/\(filename).png", width: 1024, height: 1024) { ctx in logo(ctx, x: 202, y: 202, width: 620, glyph: true) }
}
try render("assets/images/android-icon-background.png", width: 1024, height: 1024, background: tile) { _ in }
// Typography is for press copy only. The logo itself always uses approved outlines.
let fontURL = URL(fileURLWithPath: "node_modules/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf")
CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, nil)
func text(_ ctx: CGContext, _ value: String, x: CGFloat, y: CGFloat, size: CGFloat, color: CGColor = ink) {
    let font = CTFontCreateWithName("Nunito-ExtraBold" as CFString, size, nil)
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: value, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font, NSAttributedString.Key(kCTForegroundColorAttributeName as String): color]))
    ctx.saveGState(); ctx.translateBy(x: x, y: y + size); ctx.scaleBy(x: 1, y: -1); ctx.textPosition = .zero; CTLineDraw(line, ctx); ctx.restoreGState()
}
try render("public/press-kit/social/travi-social-card-1200x630.png", width: 1200, height: 630, background: paper) { ctx in
    logo(ctx, x: 80, y: 64, width: 300)
    text(ctx, "Every place you’ve been,", x: 80, y: 270, size: 58)
    text(ctx, "in order.", x: 80, y: 342, size: 58)
    text(ctx, "Collect cities. Rank favorites. Discover together.", x: 80, y: 515, size: 22, color: wordmark)
}
try render("public/press-kit/social/travi-social-square-1080.png", width: 1080, height: 1080, background: mist) { ctx in
    logo(ctx, x: 120, y: 110, width: 510)
    text(ctx, "Your places.", x: 120, y: 440, size: 82)
    text(ctx, "Your people.", x: 120, y: 540, size: 82)
    text(ctx, "Your perspective.", x: 120, y: 640, size: 72)
    text(ctx, "Go. Remember. Repeat.", x: 120, y: 920, size: 28, color: wordmark)
}
try render("public/press-kit/social/travi-story-1080x1920.png", width: 1080, height: 1920, background: paper) { ctx in
    logo(ctx, x: 120, y: 220, width: 620)
    text(ctx, "Every place", x: 120, y: 690, size: 102)
    text(ctx, "you’ve been,", x: 120, y: 815, size: 102)
    text(ctx, "in order.", x: 120, y: 940, size: 102)
    text(ctx, "Collect the places you love.", x: 120, y: 1460, size: 38, color: wordmark)
    text(ctx, "Find your next favorite.", x: 120, y: 1520, size: 38, color: wordmark)
}
try render("public/press-kit/social/travi-header-1500x500.png", width: 1500, height: 500, background: mist) { ctx in
    logo(ctx, x: 100, y: 130, width: 520)
    text(ctx, "Go. Remember.", x: 800, y: 155, size: 48)
    text(ctx, "Repeat.", x: 800, y: 220, size: 48)
}
print("Rendered transparent logos, app icons, splash assets, and four social formats.")
