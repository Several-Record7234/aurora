# <img src="public/icon.png" width="40" height="40"> Aurora: Time-of-day modification for Owlbear Rodeo

**Aurora** lets you transform the mood of your maps with real-time 'colour grading' - right inside Owlbear Rodeo. Desaturate a forest glade into gloomy shadow, bathe a tavern in golden hour warmth, or wash a battlefield in eerie moonlight. It's all done with a GPU shader that runs directly on your map, so there's no image editing, no re-uploading, and changes can be seen instantly.

Aurora gives you four intuitive controls:

- **Saturation**: boost or drain the colour intensity of your map
- **Lightness**: brighten a sun-drenched scene or darken a cave
- **Hue**: overlay a colour tint (red for a burning city, blue for an underwater temple…)
- **Opacity**: control how strong that tint is, from a subtle wash to a bold colour shift

Mix and match these to create exactly the atmosphere you're after, then save your favourites as presets that persist across every Scene in the Room.

---

## Getting Started

### 1. Install The Extension

Copy the Aurora manifest URL:

```
https://aurora-0nm6.onrender.com/manifest.json
```

Then head to your **Owlbear Rodeo Room** → **Extras** → **Extensions** → **+** (Add Custom Extension), paste the URL, and confirm.

> ![Screenshot placeholder: Adding the manifest URL in the Owlbear Rodeo extension manager]

### 2. Enable Aurora In Your Room

In the **Extensions Manager** popover, make sure Aurora is **toggled on** for this Room. You should see the <img src="public/icon.png" width="20" height="20"> Aurora icon appear in the top-left extension Action tray.

> ![Screenshot placeholder: Enabling Aurora in the room's extension list]

---

## Applying An Effect

### 3. Add Aurora To Any Map Item

Right-click any item on the **Map layer** and choose **Add Aurora** from the context menu. That's it — the shader is now attached and ready to configure!

> ![Screenshot placeholder: Right-clicking a map image and selecting "Add Aurora"]

**💡 Pro tip:** Want to affect multiple maps with a single effect? Draw a large rectangle on the **Drawing** layer, move it to the **Map** layer, then add Aurora to that rectangle. The shader covers the full area of whatever item it's attached to, so one big shape can mood-change your entire Scene in one go.

### 4. Adjust The Settings

After adding Aurora, right-click the same item again and choose **Aurora Settings**. This opens the HSLO control panel where you can tweak all four sliders and see changes as soon as you release them.

> ![Screenshot placeholder: The Aurora Settings popover with sliders]

---

## Working With Presets

Presets are a huge time-saver, and a great starting point for your own adjustments. Aurora ships with **four built-in presets** to get you going:

| Preset | Vibe |
|--------|------|
| **Midnight** | Deep desaturation with a cool blue-purple wash — perfect for nighttime encounters |
| **Golden Hour** | Warm, slightly darkened tones with a golden tint — great for sunset scenes |
| **Pre-Dawn** | Dimmed with a pale blue overlay — that quiet moment before the sun rises |
| **Blood Moon** | Heavily desaturated and darkened with a red tint — ominous and foreboding |

Plus there are two empty slots ready for your own creations.

### 5. Load a Preset

In the **Aurora Settings** popover, use the **Load Preset…** dropdown to pick any saved preset. The sliders snap to those values instantly — it's a great way to audition different moods or use a preset as a starting point before fine-tuning.

> ![Screenshot placeholder: Selecting a preset from the dropdown]

### 6. Toggle The Effect On And Off

Use the **Enabled** toggle at the top of the Aurora Settings panel to flip the shader on and off without losing your slider positions. This is really handy for comparing the "before and after" (toggle it a few times and you'll immediately see how much atmosphere the effect adds) or for sudden and dramatic mood shifts as you switch the shader right before your players' eyes!

> ![Screenshot or short recording placeholder: Toggling the effect on and off to compare]

### 7. Save Your Own Presets

Happy with your settings? Hit **Save Current As…** to store them. You can:

- **Pick a slot**: Aurora will auto-select the first empty slot, but you can choose any of the six presets
- **Overwrite an existing preset**: just select an occupied slot and confirm
- **(Re)name it**: give your preset a memorable name (up to 16 characters)

Presets are compacted and stored in the **Room metadata**, so they're shared with every player in the Room and they persist across sessions and Scene changes. A map-layer object that has an Aurora effect attached will save its parameters in its own metadata.

> ![Screenshot placeholder: The Save dialog with slot selection and name input]

---

## Managing Presets

### 8. The Action Popover (Preset Library)

Click the **<img src="public/icon.png" width="20" height="20"> Aurora** icon in the top-left extension tray to open the Action popover. This shows your **Preset Library**, a grid of all six preset slots with their names and current values.

From here you can get an overview of everything you've saved, and manage your library without needing to have a map item selected.

> ![Screenshot placeholder: The Action popover showing the Preset Library grid]

### 9. Rename Or Clear Presets

At the top of the Preset Library you'll find two mode buttons:

- **Rename**: click it, then click any occupied preset to give it a new name
- **Clear**: click it, then click any occupied preset to empty that slot completely

Both modes highlight the valid targets so you know exactly what you're clicking. Click the same mode button again (or complete the action) to exit the mode.

> ![Screenshot placeholder: Rename mode active with presets highlighted in blue]

---

## Removing An Aurora Effect

### 10. Remove The Effect Entirely

If you want to completely remove Aurora from a map item, open **Aurora Settings** and click the red **Remove Aurora** button at the bottom.

⚠️ **This deletes the shader and all its settings from that item.** If you just want to temporarily turn the effect off while keeping your slider values intact, use the **Enabled** toggle instead - that way your settings are still there when you switch it back on.

> ![Screenshot placeholder: The Remove Aurora button at the bottom of the settings panel]

---

## Need Help?

If you run into any issues, have a feature request, or just want to share the cool scenes you've created with Aurora, come find us on Discord (particularly in the #extensions-showcase channel!):

👉 **[Join the Owlbear Rodeo Discord](https://discord.gg/u5RYMkV98s)**

We'd love to hear how you're using Aurora at your table. Happy grading! 🎨
