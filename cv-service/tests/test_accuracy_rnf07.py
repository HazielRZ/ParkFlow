"""Suite automatizada de precisión y matriz de confusión RNF-07."""

from __future__ import annotations

import json
from pathlib import Path

from src.evaluation.accuracy_evaluator import AccuracyEvaluator, export_reports


def test_rnf07_accuracy_thresholds_and_confusion_matrix_export(tmp_path: Path) -> None:
    dataset_path = Path(__file__).resolve().parents[1] / "data" / "validation" / "ground_truth.json"
    evaluator = AccuracyEvaluator()
    report = evaluator.evaluate_dataset(dataset_path)

    day_sc = report.scenarios["day"]
    night_sc = report.scenarios["night_rain"]

    assert day_sc.total_samples >= 100
    assert night_sc.total_samples >= 100
    assert day_sc.accuracy >= 0.95, f"Accuracy día insuficiente: {day_sc.accuracy}"
    assert night_sc.accuracy >= 0.90, f"Accuracy noche/lluvia insuficiente: {night_sc.accuracy}"
    assert report.all_thresholds_passed is True

    # Verifica suma de matriz de confusión 3x3
    assert sum(sum(row) for row in day_sc.confusion_matrix) == day_sc.total_samples
    assert sum(sum(row) for row in night_sc.confusion_matrix) == night_sc.total_samples

    exported = export_reports(report, tmp_path)
    assert exported["json"].is_file()
    assert exported["markdown"].is_file()

    parsed = json.loads(exported["json"].read_text(encoding="utf-8"))
    assert parsed["scenarios"]["day"]["passed"] is True
    assert parsed["scenarios"]["night_rain"]["passed"] is True
    assert "###" not in exported["markdown"].read_text(encoding="utf-8")
