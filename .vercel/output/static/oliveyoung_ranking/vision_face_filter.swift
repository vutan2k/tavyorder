import Vision
import Foundation

let args = CommandLine.arguments
guard args.count > 1 else {
    print("FACES:0")
    exit(0)
}

let imagePath = args[1]
let url = URL(fileURLWithPath: imagePath)

guard FileManager.default.fileExists(atPath: imagePath) else {
    print("FACES:0")
    exit(0)
}

let request = VNDetectFaceRectanglesRequest()
let handler = VNImageRequestHandler(url: url, options: [:])

do {
    try handler.perform([request])
    let faces = request.results?.count ?? 0
    print("FACES:\(faces)")
} catch {
    print("FACES:0")
}
