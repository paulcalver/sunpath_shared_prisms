class Prism {
    constructor(x, y, rotation, ownerId, prismId) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.ownerId = ownerId;
        this.prismId = prismId;
        this.size = 50; // radius/edge factor
        this.isSelected = false;

        this.spectrum = [
            { name: 'red', hue: 0, n: 1.513 },
            { name: 'orange', hue: 30, n: 1.517 },
            { name: 'yellow', hue: 60, n: 1.519 },
            { name: 'green', hue: 120, n: 1.523 },
            { name: 'blue', hue: 240, n: 1.528 },
            { name: 'indigo', hue: 260, n: 1.532 },
            { name: 'violet', hue: 280, n: 1.538 }
        ];
    }

    // HELPER: Keeps angles within -180 to 180 range
    normalizeAngle(a) {
        let ang = a % 360;
        if (ang <= -180) ang += 360;
        if (ang > 180) ang -= 360;
        return ang;
    }

    getVertices() {
        const vertices = [];
        for (let i = 0; i < 3; i++) {
            const angle = this.rotation + (i * 120);
            const vx = this.x + cos(angle) * this.size;
            const vy = this.y + sin(angle) * this.size;
            vertices.push(createVector(vx, vy));
        }
        return vertices;
    }

    getFaceNormals() {
        const vertices = this.getVertices();
        const normals = [];
        const center = createVector(this.x, this.y);
        for (let i = 0; i < 3; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 3];
            const midpoint = p5.Vector.add(v1, v2).div(2);
            let normalVec = p5.Vector.sub(midpoint, center).normalize();
            normals.push({
                angle: normalVec.heading(), // Angle of the normal in p5 world space
                edgeStart: v1,
                edgeEnd: v2
            });
        }
        return normals;
    }

    getHitFace(sunAngle) {
        const normals = this.getFaceNormals();
        let bestFace = -1;
        let minDiff = 180;
        // Check the angle FROM the light source TO the prism (sunAngle)
        for (let i = 0; i < normals.length; i++) {
            // Difference between Sun's direction and where the face is pointing
            let diff = abs(this.normalizeAngle(sunAngle - normals[i].angle));
            if (diff < 90 && diff < minDiff) {
                minDiff = diff;
                bestFace = i;
            }
        }
        return bestFace;
    }

    // Find where a parallel ray (infinite distance source) intersects a line segment
    findParallelRayIntersection(rayAngle, prismPoint, lineStart, lineEnd) {
        // Ray direction (parallel rays all have same direction)
        const r_dx = cos(rayAngle);
        const r_dy = sin(rayAngle);

        // Line segment direction
        const s_dx = lineEnd.x - lineStart.x;
        const s_dy = lineEnd.y - lineStart.y;

        const denominator = (r_dx * s_dy - r_dy * s_dx);
        if (abs(denominator) < 0.001) return null; // Parallel

        // We want the intersection of:
        // 1. A ray from prismPoint in direction (r_dx, r_dy)
        // 2. The line segment from lineStart to lineEnd

        const t = ((lineStart.x - prismPoint.x) * s_dy - (lineStart.y - prismPoint.y) * s_dx) / denominator;
        const u = ((lineStart.x - prismPoint.x) * r_dy - (lineStart.y - prismPoint.y) * r_dx) / denominator;

        // Check if intersection is on the line segment (0<=u<=1)
        if (u >= 0 && u <= 1) {
            return createVector(prismPoint.x + t * r_dx, prismPoint.y + t * r_dy);
        }
        return null;
    }


    // New method using geometric intersection tracing
    calculateRefraction(sunAngle) {
        let faceIndex = this.getHitFace(sunAngle);
        if (faceIndex === -1) {
            // console.log('No face hit');
            return null;
        }

        const normals = this.getFaceNormals();
        const entryFace = normals[faceIndex];

        // --- 1. Find the exact entry point (parallel ray from sun hitting this face) ---
        // We shoot a ray BACKWARDS from prism centre to find where it hits the entry face
        const entryPoint = this.findParallelRayIntersection(
            sunAngle + 180, // Shoot backwards to find entry
            createVector(this.x, this.y),
            entryFace.edgeStart,
            entryFace.edgeEnd
        );

        if (!entryPoint) {
            // console.log('No entry point found');
            return null;
        }

        // Rest of the method stays the same...
        let i1 = this.normalizeAngle(sunAngle - entryFace.angle);
        // console.log('Entry angle i1:', i1.toFixed(1));
        let results = [];

        for (let ray of this.spectrum) {
            let n = ray.n;

            // Check for total internal reflection at entry
            let sinValue = sin(i1) / n;
            if (abs(sinValue) > 1) {
                // console.log('TIR at entry for', ray.name, 'sinValue:', sinValue);
                continue;
            }

            let r1 = asin(sinValue);
            let internalRayAngle = this.normalizeAngle(entryFace.angle + r1);

            let exitPoint = null;
            let exitFace = null;

            for (let j = 0; j < 3; j++) {
                if (j === faceIndex) continue;
                const currentFace = normals[j];
                const intersection = this.findParallelRayIntersection(
                    internalRayAngle,
                    entryPoint,
                    currentFace.edgeStart,
                    currentFace.edgeEnd
                );

                if (intersection) {
                    exitPoint = intersection;
                    exitFace = currentFace;
                    break;
                }
            }

            if (!exitPoint) {
                // console.log('No exit point for', ray.name);
                continue;
            }

            let i2 = this.normalizeAngle(internalRayAngle - exitFace.angle);
            let sinI2 = n * sin(i2);
            if (abs(sinI2) > 1) {
                // console.log('TIR at exit for', ray.name);
                continue;
            }
            let exitAngleLocal = asin(sinI2);
            let exitWorldAngle = this.normalizeAngle(exitFace.angle + exitAngleLocal);

            results.push({
                hue: ray.hue,
                angle: exitWorldAngle,
                entryPt: entryPoint,
                exitPt: exitPoint
            });
        }

        // console.log('Results count:', results.length);
        return results;
    }

    drawOutline(mySocketId) {
        const verts = this.getVertices();
        noFill();

        // Red for my prisms, white for others (HSB mode)
        const isMine = this.ownerId === mySocketId;
        if (isMine) {
            // Red: hue=0, full saturation, brighter when selected
            stroke(0, 100, this.isSelected ? 100 : 70);
        } else {
            // White: no saturation, brighter when selected
            stroke(0, 0, this.isSelected ? 100 : 100);
        }

        strokeWeight(this.isSelected ? 2 : 1);
        beginShape();
        for (let v of verts) vertex(v.x, v.y);
        endShape(CLOSE);
    }

    // Updated draw method needs sunSource coordinates
    // graphicsBuffer: optional p5.Graphics object to draw rays to (for shader effects)
    drawRays(sunAngle, sunElevation, graphicsBuffer) {
        let rays = this.calculateRefraction(sunAngle);
        if (!rays) return;

        // Calculate ray length based on elevation
        const maxRayLength = max(width, height) * 2;
        const minRayLength = 100;

        let rayLength;

        if (sunElevation < 0.5) {
            rayLength = maxRayLength;
        } else if (sunElevation > 80) {
            rayLength = minRayLength;
        } else {
            rayLength = map(sunElevation, 0.5, 80, maxRayLength, minRayLength);
        }

        // Choose which context to draw to
        const g = graphicsBuffer || window;

        g.push();
        g.angleMode(DEGREES);
        g.colorMode(HSB, 360, 100, 100, 100);

        for (let r of rays) {
            g.strokeWeight(2);

            // Draw Internal Path
            g.stroke(r.hue, 50, 100, 50);
            g.line(r.entryPt.x, r.entryPt.y, r.exitPt.x, r.exitPt.y);

            // Draw Emerging Path as expanding wedge
            let beamX = r.exitPt.x + cos(r.angle) * rayLength;
            let beamY = r.exitPt.y + sin(r.angle) * rayLength;

            // Calculate width at the far end (proportional to ray length)
            let widthAtEnd = rayLength * 0.015;

            // Perpendicular angle for width
            let perpAngle = r.angle + 90;

            // Two edge points at the far end
            let x1 = beamX + cos(perpAngle) * widthAtEnd;
            let y1 = beamY + sin(perpAngle) * widthAtEnd;
            let x2 = beamX + cos(perpAngle + 180) * widthAtEnd;
            let y2 = beamY + sin(perpAngle + 180) * widthAtEnd;

            // Draw as filled triangle (wedge)
            g.fill(r.hue, 80, 100, 80);
            g.noStroke();
            g.triangle(r.exitPt.x, r.exitPt.y, x1, y1, x2, y2);
        }
        g.pop();
    }

    containsPoint(px, py) {
        const vertices = this.getVertices();
        let sign = null;
        for (let i = 0; i < 3; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 3];
            const cross = (v2.x - v1.x) * (py - v1.y) - (v2.y - v1.y) * (px - v1.x);
            if (sign === null) sign = cross > 0;
            else if ((cross > 0) !== sign) return false;
        }
        return true;
    }

    // Add this method to the Prism class
    update(x, y, rotation) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
    }
}
