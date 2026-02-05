class Prism {
    constructor(x, y, rotation, ownerId, prismId) {
        this.x = x;
        this.y = y;
        this.rotation = rotation; // degrees
        this.ownerId = ownerId;
        this.prismId = prismId;
        this.size = 60; // edge length in pixels
        this.isSelected = false;

        // Refractive indices for spectrum
        this.refractiveIndices = {
            red: 1.513,
            orange: 1.517,
            yellow: 1.519,
            green: 1.523,
            blue: 1.528,
            indigo: 1.532,
            violet: 1.538
        };

        this.spectrum = [
            { name: 'red', hue: 0, n: this.refractiveIndices.red },
            { name: 'orange', hue: 30, n: this.refractiveIndices.orange },
            { name: 'yellow', hue: 60, n: this.refractiveIndices.yellow },
            { name: 'green', hue: 120, n: this.refractiveIndices.green },
            { name: 'blue', hue: 240, n: this.refractiveIndices.blue },
            { name: 'indigo', hue: 260, n: this.refractiveIndices.indigo },
            { name: 'violet', hue: 280, n: this.refractiveIndices.violet }
        ];
    }

    // Calculate the three vertices of the equilateral triangle
    getVertices() {
        const vertices = [];
        const angleOffset = this.rotation;

        console.log('Prism rotation:', this.rotation);


        // Equilateral triangle: three points 120 degrees apart
        for (let i = 0; i < 3; i++) {
            const angle = angleOffset + (i * 120);
            const x = this.x + cos(angle) * this.size;
            const y = this.y + sin(angle) * this.size;
            vertices.push(createVector(x, y));
        }

        return vertices;
    }

    // Check if a point is inside the prism (for selection)
    containsPoint(px, py) {
        const vertices = this.getVertices();
        const point = createVector(px, py);

        // Use cross product method to check if point is inside triangle
        let sign = null;
        for (let i = 0; i < 3; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 3];

            const edge = p5.Vector.sub(v2, v1);
            const toPoint = p5.Vector.sub(point, v1);
            const cross = edge.x * toPoint.y - edge.y * toPoint.x;

            if (sign === null) {
                sign = cross > 0;
            } else if ((cross > 0) !== sign) {
                return false;
            }
        }
        return true;
    }

    // Get the three face normals (perpendicular to each edge, pointing outward)
    getFaceNormals() {
        const vertices = this.getVertices();
        const normals = [];
        const center = createVector(this.x, this.y);

        for (let i = 0; i < 3; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 3];
            const edge = p5.Vector.sub(v2, v1);

            // Perpendicular (rotate 90 degrees clockwise)
            let normal = createVector(edge.y, -edge.x).normalize();

            // Edge midpoint
            const midpoint = p5.Vector.add(v1, v2).div(2);

            // Vector from center to midpoint
            const toMidpoint = p5.Vector.sub(midpoint, center);

            // If normal points opposite to toMidpoint, flip it
            if (normal.dot(toMidpoint) < 0) {
                normal.mult(-1);
            }

            normals.push({
                normal: normal,
                edgeStart: v1,
                edgeEnd: v2
            });
        }

        return normals;
    }

// Calculate dispersion rays based on sun azimuth
calculateDispersion(sunAzimuth) {
  const rays = [];
  
  // Sun ray direction - light travels towards us from sun position
  const sunDir = createVector(cos(sunAzimuth + 180), sin(sunAzimuth + 180)).normalize();
  
  const vertices = this.getVertices();
  
  // Find which edge faces the sun most directly
  let entryEdgeIndex = -1;
  let maxAlignment = -Infinity;
  let entryNormal = null;
  
  for (let i = 0; i < 3; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % 3];
    const edgeMid = p5.Vector.add(v1, v2).div(2);
    const edge = p5.Vector.sub(v2, v1);
    
    // Normal pointing outward
    const normal = createVector(edge.y, -edge.x).normalize();
    const toCenter = p5.Vector.sub(createVector(this.x, this.y), edgeMid);
    if (normal.dot(toCenter) > 0) {
      normal.mult(-1);
    }
    
    // Check if sun hits this face
    const alignment = sunDir.dot(normal);
    if (alignment > maxAlignment) {
      maxAlignment = alignment;
      entryEdgeIndex = i;
      entryNormal = normal;
    }
  }
  
  if (maxAlignment <= 0) return rays; // No face hit
  
  // Calculate angle of incidence (angle between sun ray and surface normal)
  const incidentAngle = degrees(acos(maxAlignment));
  
  // Entry and exit points
  const v1 = vertices[entryEdgeIndex];
  const v2 = vertices[(entryEdgeIndex + 1) % 3];
  const entryPoint = p5.Vector.add(v1, v2).div(2);
  
  // Exit edge is opposite
  const exitEdgeIndex = (entryEdgeIndex + 2) % 3;
  const v3 = vertices[exitEdgeIndex];
  const v4 = vertices[(exitEdgeIndex + 1) % 3];
  const exitPoint = p5.Vector.add(v3, v4).div(2);
  
  // Direction through prism
  const throughAngle = atan2(exitPoint.y - entryPoint.y, exitPoint.x - entryPoint.x);
  
  // Each colour has different deviation based on refractive index
  for (let colour of this.spectrum) {
    const deviation = this.calculateDeviation(incidentAngle, colour.n);
    const exitAngle = throughAngle + deviation;
    
    rays.push({
      colour: colour,
      direction: createVector(cos(exitAngle), sin(exitAngle)),
      origin: exitPoint.copy()
    });
  }
  
  return rays;
}

    // Calculate deviation for given incident angle and refractive index
    // Calculate deviation for given incident angle and refractive index
calculateDeviation(incidentAngle, n) {
  // Simplified: deviation increases with incident angle and refractive index
  // Higher refractive index = more bending
  // This is a linear approximation rather than full Snell's law
  
  const baseFactor = 0.3; // tuning parameter
  const deviation = (n - 1.0) * incidentAngle * baseFactor;
  
  return deviation;
}




    // Update position and rotation
    update(x, y, rotation) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
    }

    // Display the prism
    display() {
        const vertices = this.getVertices();

        noStroke();

        // Selected prisms are red, others white
        if (this.isSelected) {
            fill(0, 100, 100); // HSB: hue 0 (red), full saturation, full brightness
        } else {
            fill(0, 0, 100); // HSB: white
        }

        beginShape();
        for (let v of vertices) {
            vertex(v.x, v.y);
        }
        endShape(CLOSE);
    }

    // Display dispersion rays
    // Display dispersion rays
    displayDispersion(sunAzimuth) {
        const rays = this.calculateDispersion(sunAzimuth);

        // Ray length to reach canvas edge
        const rayLength = max(width, height) * 2;

        strokeWeight(2);

        for (let ray of rays) {
            stroke(ray.colour.hue, 100, 100);
            const endX = ray.origin.x + ray.direction.x * rayLength;
            const endY = ray.origin.y + ray.direction.y * rayLength;
            line(ray.origin.x, ray.origin.y, endX, endY);
        }
    }


}