// Global Prisms — Prism Class
// Handles geometry, Snell's law refraction, and rendering for a single triangular prism.
//
// Author: Paul Calver <pcalv001@gold.ac.uk>

class Prism {
    constructor(x, y, rotation, ownerId, prismId) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.ownerId = ownerId;
        this.prismId = prismId;
        this.size = 30; // radius/edge factor
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

    // Returns the 3 corner vertices of the equilateral triangle,
    // evenly spaced 120° apart from the prism's rotation angle.
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

    // Returns the outward-facing normal for each of the 3 edges.
    // Each normal points from the prism centre toward the edge midpoint.
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
                angle: normalVec.heading(), // angle of the normal in p5 world space
                edgeStart: v1,
                edgeEnd: v2
            });
        }
        return normals;
    }

    // Returns the index of the face that the incoming sunlight hits first.
    // A face is a candidate only if its normal is within 90° of the sun direction
    // (i.e. the face is angled toward the light source).
    getHitFace(sunAngle) {
        const normals = this.getFaceNormals();
        let bestFace = -1;
        let minDiff = 180;
        for (let i = 0; i < normals.length; i++) {
            // Angular difference between sun direction and face normal
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


    // Traces refracted rays through the prism for each wavelength in the spectrum.
    // Returns an array of ray results (entry point, exit point, exit angle, hue),
    // or null if the sun isn't hitting any face.
    //
    // Pipeline per wavelength:
    //   1. Find which face the light enters and locate the entry point
    //   2. Apply Snell's law at entry: sin(i1) / n → refracted angle inside glass
    //   3. Trace the internal ray to an exit face
    //   4. Apply Snell's law at exit: n * sin(i2) → outgoing angle
    //   5. Skip wavelengths that undergo total internal reflection (|sin| > 1)
    calculateRefraction(sunAngle) {
        let faceIndex = this.getHitFace(sunAngle);
        if (faceIndex === -1) return null;

        const normals = this.getFaceNormals();
        const entryFace = normals[faceIndex];

        // Shoot a ray backwards from the prism centre to find where it intersects
        // the entry face — this gives us the actual entry point on the surface.
        const entryPoint = this.findParallelRayIntersection(
            sunAngle + 180,
            createVector(this.x, this.y),
            entryFace.edgeStart,
            entryFace.edgeEnd
        );

        if (!entryPoint) return null;

        // Angle of incidence at the entry face (relative to face normal)
        let i1 = this.normalizeAngle(sunAngle - entryFace.angle);
        let results = [];

        for (let ray of this.spectrum) {
            let n = ray.n; // refractive index for this wavelength

            // Snell's law at entry: n_air * sin(i1) = n_glass * sin(r1)
            let sinValue = sin(i1) / n;
            if (abs(sinValue) > 1) continue; // total internal reflection — skip

            let r1 = asin(sinValue);
            let internalRayAngle = this.normalizeAngle(entryFace.angle + r1);

            // Find which of the other two faces the internal ray exits through
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

            if (!exitPoint) continue;

            // Snell's law at exit: n_glass * sin(i2) = n_air * sin(r2)
            let i2 = this.normalizeAngle(internalRayAngle - exitFace.angle);
            let sinI2 = n * sin(i2);
            if (abs(sinI2) > 1) continue; // total internal reflection at exit — skip

            let exitAngleLocal = asin(sinI2);
            let exitWorldAngle = this.normalizeAngle(exitFace.angle + exitAngleLocal);

            results.push({
                hue: ray.hue,
                angle: exitWorldAngle,
                entryPt: entryPoint,
                exitPt: exitPoint
            });
        }

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

    // Draws the refracted light rays for this prism.
    // Each wavelength gets two segments:
    //   - A faint line inside the glass (entry → exit point)
    //   - An expanding wedge triangle outside (exit point → far end), tapering
    //     wider with distance to simulate beam spread.
    // Ray length is mapped from sun elevation: grazing light (low elevation) = long
    // rays that sweep across the canvas; overhead light (high elevation) = short rays.
    // graphicsBuffer: p5.Graphics to draw into (used for the shader post-process pass).
    drawRays(sunAngle, sunElevation, graphicsBuffer) {
        let rays = this.calculateRefraction(sunAngle);
        if (!rays) return;

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

        const g = graphicsBuffer || window;

        g.push();
        g.angleMode(DEGREES);
        g.colorMode(HSB, 360, 100, 100, 100);

        for (let r of rays) {
            g.strokeWeight(2);

            // Internal path through the glass
            g.stroke(r.hue, 50, 100, 50);
            g.line(r.entryPt.x, r.entryPt.y, r.exitPt.x, r.exitPt.y);

            // Tip of the outgoing beam
            let beamX = r.exitPt.x + cos(r.angle) * rayLength;
            let beamY = r.exitPt.y + sin(r.angle) * rayLength;

            // Beam width grows with distance (1.5% of ray length at the far end)
            let widthAtEnd = rayLength * 0.015;
            let perpAngle = r.angle + 90;

            // Far-end edge points, offset perpendicular to the ray direction
            let x1 = beamX + cos(perpAngle) * widthAtEnd;
            let y1 = beamY + sin(perpAngle) * widthAtEnd;
            let x2 = beamX + cos(perpAngle + 180) * widthAtEnd;
            let y2 = beamY + sin(perpAngle + 180) * widthAtEnd;

            // Filled wedge triangle: apex at exit point, base at far end
            g.fill(r.hue, 100, 100, 30);
            g.noStroke();
            g.triangle(r.exitPt.x, r.exitPt.y, x1, y1, x2, y2);
        }
        g.pop();
    }

    // Point-in-triangle test using the cross product winding method.
    // For each edge, the cross product with the point tells which side it's on.
    // If all three are the same sign, the point is inside.
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

    update(x, y, rotation) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
    }
}
